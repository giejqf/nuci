// SPDX-License-Identifier: Apache-2.0
//
// Client-side uci mirror with a local staging layer (ADR-0002).
//
//   base     what rpcd returns for this session (committed config + the
//            session's saved-but-unapplied delta)
//   ops      local edits, replayed over base to give the staged view
//   pending  the session's saved-but-unapplied changes (`uci changes`)
//
// save() turns the diff between view and base into uci add/set/delete/order
// calls, then reloads base. Framework-free; see store.svelte.ts for runes.

import type { UciSection, UciSetValues, UciValues } from '@nuci/rpc';
import { isValidName, parseRef, parseSelector, type UciRef } from './path';

export type UciValue = string | string[];

/** The subset of `@nuci/rpc`'s `uci` API the model needs. */
export interface UciApi {
	getAll(config: string): Promise<UciValues>;
	changes(config?: string): Promise<Record<string, [string, ...string[]][]>>;
	set(config: string, section: string, values: UciSetValues): Promise<unknown>;
	add(config: string, type: string, values?: UciSetValues, name?: string): Promise<string>;
	delete(config: string, section: string, options?: string[]): Promise<unknown>;
	order(config: string, sections: string[]): Promise<unknown>;
	revert(config: string): Promise<unknown>;
	apply(rollback: boolean, timeout?: number): Promise<unknown>;
	confirm(): Promise<unknown>;
}

export type Section = UciSection;

export type Change =
	| {
			kind: 'add';
			config: string;
			section: string;
			type: string;
			values: Record<string, UciValue>;
	  }
	| { kind: 'remove'; config: string; section: string; type: string }
	| {
			kind: 'set';
			config: string;
			section: string;
			type: string;
			option: string;
			from?: UciValue;
			to: UciValue;
	  }
	| {
			kind: 'unset';
			config: string;
			section: string;
			type: string;
			option: string;
			from: UciValue;
	  }
	| { kind: 'order'; config: string; sections: string[] };

type Op =
	| { op: 'add'; config: string; section: string; type: string; anonymous: boolean }
	| { op: 'set'; config: string; section: string; option: string; value: UciValue | null }
	| { op: 'remove'; config: string; section: string }
	| { op: 'order'; config: string; sections: string[] };

const META = new Set(['.name', '.type', '.anonymous', '.index']);
const PLACEHOLDER = /^_new[0-9]+$/;

function isEmpty(v: unknown): boolean {
	return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

function sameValue(a: unknown, b: unknown): boolean {
	if (Array.isArray(a) || Array.isArray(b)) {
		return (
			Array.isArray(a) &&
			Array.isArray(b) &&
			a.length === b.length &&
			a.every((x, i) => x === b[i])
		);
	}
	return a === b;
}

function options(s: Section): Record<string, UciValue> {
	const out: Record<string, UciValue> = {};
	for (const [k, v] of Object.entries(s)) {
		if (!META.has(k) && (typeof v === 'string' || Array.isArray(v))) out[k] = v;
	}
	return out;
}

function sorted(sections: Record<string, Section>): Section[] {
	return Object.values(sections).sort((a, b) => (a['.index'] ?? 0) - (b['.index'] ?? 0));
}

export class UciModel {
	readonly api: UciApi;
	#base = new Map<string, Record<string, Section>>();
	#loading = new Map<string, Promise<void>>();
	#ops: Op[] = [];
	#views = new Map<string, Record<string, Section>>();
	#pending: Record<string, [string, ...string[]][]> = {};
	#nextId = 0;
	#listeners = new Set<() => void>();

	constructor(api: UciApi) {
		this.api = api;
	}

	/** Called after every change to the mirror, staging or pending set. */
	subscribe(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	#emit(): void {
		this.#views.clear();
		for (const l of this.#listeners) l();
	}

	// --- Mirror --------------------------------------------------------------

	isLoaded(config: string): boolean {
		return this.#base.has(config);
	}

	/** Load configs that are not mirrored yet (concurrently, one JSON-RPC batch). */
	async load(...configs: string[]): Promise<void> {
		await Promise.all(
			configs.map(
				(c) => this.#loading.get(c) ?? (this.isLoaded(c) ? undefined : this.#fetch(c)),
			),
		);
	}

	/** Re-read configs from rpcd (default: all mirrored ones). Local edits are kept. */
	async reload(configs: string[] = [...this.#base.keys()]): Promise<void> {
		await Promise.all(configs.map((c) => this.#fetch(c)));
	}

	#fetch(config: string): Promise<void> {
		const p = this.api
			.getAll(config)
			.then((values) => {
				this.#base.set(config, values ?? {});
				this.#emit();
			})
			.finally(() => this.#loading.delete(config));
		this.#loading.set(config, p);
		return p;
	}

	// --- Staged view ---------------------------------------------------------

	#view(config: string): Record<string, Section> {
		const cached = this.#views.get(config);
		if (cached) return cached;
		const view: Record<string, Section> = {};
		for (const [name, s] of Object.entries(this.#base.get(config) ?? {})) view[name] = { ...s };
		let maxIndex = Math.max(-1, ...Object.values(view).map((s) => s['.index'] ?? 0));
		for (const op of this.#ops) {
			if (op.config !== config) continue;
			switch (op.op) {
				case 'add':
					view[op.section] = {
						'.name': op.section,
						'.type': op.type,
						'.anonymous': op.anonymous,
						'.index': ++maxIndex,
					};
					break;
				case 'set': {
					const s = view[op.section];
					if (!s) break;
					if (isEmpty(op.value)) delete s[op.option];
					else s[op.option] = op.value as UciValue;
					break;
				}
				case 'remove':
					delete view[op.section];
					break;
				case 'order':
					op.sections.forEach((name, i) => {
						const s = view[name];
						if (s) s['.index'] = i;
					});
					break;
			}
		}
		this.#views.set(config, view);
		return view;
	}

	/** Sections of `config` in order, optionally only those of `type`. */
	sections(config: string, type?: string): Section[] {
		return sorted(this.#view(config)).filter((s) => !type || s['.type'] === type);
	}

	/** Resolve `@type[i]` selectors to section names; names pass through. */
	resolveSection(config: string, section: string): string | undefined {
		const sel = parseSelector(section);
		if (!sel) return this.#view(config)[section] ? section : undefined;
		const list = this.sections(config, sel.type);
		return list[sel.index < 0 ? list.length + sel.index : sel.index]?.['.name'];
	}

	resolve(ref: string | UciRef): (UciRef & { section: string }) | undefined {
		const r = typeof ref === 'string' ? parseRef(ref) : ref;
		const section = this.resolveSection(r.config, r.section);
		return section ? { ...r, section } : undefined;
	}

	getSection(config: string, section: string): Section | undefined {
		const name = this.resolveSection(config, section);
		return name ? this.#view(config)[name] : undefined;
	}

	get(config: string, section: string, option: string): UciValue | undefined {
		const v = this.getSection(config, section)?.[option];
		return typeof v === 'string' || Array.isArray(v) ? v : undefined;
	}

	/** The value from rpcd, ignoring local edits. */
	getBase(config: string, section: string, option: string): UciValue | undefined {
		const v = this.#base.get(config)?.[section]?.[option];
		return typeof v === 'string' || Array.isArray(v) ? v : undefined;
	}

	// --- Staging -------------------------------------------------------------

	/** Stage an option value; empty values (`''`, `[]`, null) unset the option. */
	set(config: string, section: string, option: string, value: UciValue | null | undefined): void {
		const name = this.resolveSection(config, section);
		if (!name) throw new Error(`no such section ${config}.${section}`);
		if (META.has(option) || !isValidName(option))
			throw new Error(`invalid option name ${option}`);
		const cur = this.get(config, name, option);
		if (sameValue(cur, isEmpty(value) ? undefined : value)) return;
		this.#ops.push({
			op: 'set',
			config,
			section: name,
			option,
			value: isEmpty(value) ? null : (value as UciValue),
		});
		this.#emit();
	}

	/** Stage a new section; returns its name (a `_newN` placeholder when anonymous). */
	add(
		config: string,
		type: string,
		name?: string,
		values: Record<string, UciValue> = {},
	): string {
		if (!isValidName(type)) throw new Error(`invalid section type ${type}`);
		if (name !== undefined && (!isValidName(name) || this.#view(config)[name]))
			throw new Error(`invalid or duplicate section name ${name}`);
		const section = name ?? `_new${this.#nextId++}`;
		this.#ops.push({ op: 'add', config, section, type, anonymous: name === undefined });
		for (const [option, value] of Object.entries(values))
			this.#ops.push({ op: 'set', config, section, option, value });
		this.#emit();
		return section;
	}

	remove(config: string, section: string): void {
		const name = this.resolveSection(config, section);
		if (!name) return;
		this.#ops.push({ op: 'remove', config, section: name });
		this.#emit();
	}

	/** Stage a new order for (a subset of) the sections. */
	order(config: string, sections: string[]): void {
		const all = this.sections(config).map((s) => s['.name']);
		const rest = all.filter((n) => !sections.includes(n));
		this.#ops.push({
			op: 'order',
			config,
			sections: [...sections.filter((n) => all.includes(n)), ...rest],
		});
		this.#emit();
	}

	/** Drop local edits (of one config, or all). */
	revertLocal(config?: string): void {
		this.#ops = config ? this.#ops.filter((o) => o.config !== config) : [];
		this.#emit();
	}

	// --- Review --------------------------------------------------------------

	/** Local edits as a minimal list of changes (diff of view vs base). */
	changes(config?: string): Change[] {
		const configs = config ? [config] : [...new Set(this.#ops.map((o) => o.config))];
		const out: Change[] = [];
		for (const c of configs) {
			const base = this.#base.get(c) ?? {};
			const view = this.#view(c);
			for (const s of sorted(base)) {
				const name = s['.name'];
				const v = view[name];
				if (!v) {
					out.push({ kind: 'remove', config: c, section: name, type: s['.type'] });
					continue;
				}
				const before = options(s);
				const after = options(v);
				for (const [opt, to] of Object.entries(after)) {
					if (!sameValue(before[opt], to)) {
						const ch: Change = {
							kind: 'set',
							config: c,
							section: name,
							type: s['.type'],
							option: opt,
							to,
						};
						if (before[opt] !== undefined) ch.from = before[opt];
						out.push(ch);
					}
				}
				for (const [opt, from] of Object.entries(before)) {
					if (!(opt in after))
						out.push({
							kind: 'unset',
							config: c,
							section: name,
							type: s['.type'],
							option: opt,
							from,
						});
				}
			}
			for (const v of sorted(view)) {
				if (!base[v['.name']])
					out.push({
						kind: 'add',
						config: c,
						section: v['.name'],
						type: v['.type'],
						values: options(v),
					});
			}
			const baseOrder = sorted(base)
				.map((s) => s['.name'])
				.filter((n) => view[n]);
			const viewOrder = sorted(view)
				.map((s) => s['.name'])
				.filter((n) => base[n]);
			if (!sameValue(baseOrder, viewOrder))
				out.push({
					kind: 'order',
					config: c,
					sections: sorted(view).map((s) => s['.name']),
				});
		}
		return out;
	}

	get dirty(): boolean {
		return this.changes().length > 0;
	}

	/** Saved-but-unapplied changes in the rpcd session, per config. */
	get pending(): Record<string, [string, ...string[]][]> {
		return this.#pending;
	}

	get pendingCount(): number {
		return Object.values(this.#pending).reduce((n, l) => n + l.length, 0);
	}

	async refreshPending(): Promise<void> {
		this.#pending = (await this.api.changes()) ?? {};
		this.#emit();
	}

	// --- Save ----------------------------------------------------------------

	/** Push local edits into the rpcd session delta, then reload the mirror. */
	async save(): Promise<void> {
		const changes = this.changes();
		const configs = [...new Set(changes.map((c) => ('config' in c ? c.config : '')))].filter(
			Boolean,
		);
		await Promise.all(
			configs.map((c) =>
				this.#saveConfig(
					c,
					changes.filter((ch) => ch.config === c),
				),
			),
		);
		this.#ops = this.#ops.filter((o) => !configs.includes(o.config));
		await this.reload(configs);
		await this.refreshPending();
	}

	async #saveConfig(config: string, changes: Change[]): Promise<void> {
		const names = new Map<string, string>();
		// 1. adds (sequential: rpcd assigns names in order)
		for (const ch of changes) {
			if (ch.kind !== 'add') continue;
			const anonymous = PLACEHOLDER.test(ch.section);
			const real = await this.api.add(
				config,
				ch.type,
				ch.values,
				anonymous ? undefined : ch.section,
			);
			names.set(ch.section, real);
		}
		// 2. option sets and unsets, 3. removals (batched together)
		const sets = new Map<string, UciSetValues>();
		const unsets = new Map<string, string[]>();
		for (const ch of changes) {
			if (ch.kind === 'set')
				sets.set(ch.section, { ...sets.get(ch.section), [ch.option]: ch.to });
			if (ch.kind === 'unset')
				unsets.set(ch.section, [...(unsets.get(ch.section) ?? []), ch.option]);
		}
		await Promise.all([
			...[...sets].map(([s, values]) => this.api.set(config, s, values)),
			...[...unsets].map(([s, opts]) => this.api.delete(config, s, opts)),
			...changes
				.filter((c) => c.kind === 'remove')
				.map((c) => this.api.delete(config, c.section)),
		]);
		// 4. order, with placeholders mapped to the names rpcd assigned
		const order = changes.find((c) => c.kind === 'order');
		if (order && order.kind === 'order')
			await this.api.order(
				config,
				order.sections.map((n) => names.get(n) ?? n),
			);
	}

	/** Discard the session's saved-but-unapplied changes. */
	async revertPending(configs: string[] = Object.keys(this.#pending)): Promise<void> {
		await Promise.all(configs.map((c) => this.api.revert(c)));
		await this.reload(configs.filter((c) => this.isLoaded(c)));
		await this.refreshPending();
	}
}
