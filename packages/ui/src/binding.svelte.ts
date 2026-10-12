// SPDX-License-Identifier: Apache-2.0
//
// Bind a field to a uci option ("config.section.option"). Reads come from
// the staged view, writes stage local edits (never committed directly).

import type { UciValue } from '@nuci/uci';
import { parseRef } from '@nuci/uci';
import { tryNuciContext } from './context';

export interface UciBinding {
	/** Whether the option's section exists (config loaded). */
	readonly ready: boolean;
	readonly value: UciValue | undefined;
	readonly baseValue: UciValue | undefined;
	readonly writable: boolean;
	set(value: UciValue | null): void;
}

export function bindUci(ref: () => string | undefined): UciBinding | null {
	const ctx = tryNuciContext();
	if (!ctx) return null;
	const parsed = $derived.by(() => {
		const r = ref();
		return r ? parseRef(r) : undefined;
	});
	const resolved = $derived(
		parsed ? ctx.uci.resolve(`${parsed.config}.${parsed.section}`) : undefined,
	);
	return {
		get ready() {
			return !!resolved;
		},
		get value() {
			if (!parsed?.option || !resolved) return undefined;
			return ctx.uci.get(resolved.config, resolved.section, parsed.option);
		},
		get baseValue() {
			if (!parsed?.option || !resolved) return undefined;
			return ctx.uci.getBase(resolved.config, resolved.section, parsed.option);
		},
		get writable() {
			return !!parsed && (ctx.canWrite?.(parsed.config) ?? true) && !ctx.uci.busy;
		},
		set(value: UciValue | null) {
			if (!parsed?.option || !resolved) return;
			ctx.uci.set(resolved.config, resolved.section, parsed.option, value);
		},
	};
}

export function asString(v: UciValue | undefined): string {
	return Array.isArray(v) ? v.join(' ') : (v ?? '');
}

export function asList(v: UciValue | undefined): string[] {
	if (Array.isArray(v)) return v;
	return v ? v.split(/\s+/).filter(Boolean) : [];
}
