// SPDX-License-Identifier: Apache-2.0
//
// The editing surface field components need (`UciView`), implemented by the
// host's UciStore and, inside nuci-apps, by HostUciStore: a reactive adapter
// over the framework-neutral `HostContext.uci` of @nuci/app-sdk (ADR-0004).
// Apps bundle their own Svelte runtime, so reactivity is re-created here from
// the host's change notifications instead of sharing signals.

import type { UciRef } from './path';
import type { Section, UciValue } from './model';

export type ResolvedRef = UciRef & { section: string };

export interface UciView {
	load(...configs: string[]): Promise<void>;
	isLoaded(config: string): boolean;
	get(config: string, section: string, option: string): UciValue | undefined;
	/** The committed (loaded) value, before staged edits. */
	getBase(config: string, section: string, option: string): UciValue | undefined;
	getSection(config: string, section: string): Section | undefined;
	sections(config: string, type?: string): Section[];
	resolve(ref: string): ResolvedRef | undefined;
	set(config: string, section: string, option: string, value: UciValue | null | undefined): void;
	/**
	 * `draft`: the section is editable but not a change until confirmDraft()
	 * (an "add" dialog); remove() discards it. Hosts without drafts stage it
	 * right away.
	 */
	add(
		config: string,
		type: string,
		name?: string,
		values?: Record<string, UciValue>,
		opts?: { draft?: boolean },
	): string;
	confirmDraft?(config: string, section: string): void;
	remove(config: string, section: string): void;
	order(config: string, sections: string[]): void;
	/** True while an apply is in progress (fields lock). */
	readonly busy: boolean;
}

/** Structurally identical to `HostUci` in @nuci/app-sdk (kept dependency-free). */
export interface HostUciLike extends Omit<UciView, 'busy'> {
	readonly busy: boolean;
	canWrite(config: string): boolean;
	/** Called after every change (loads, edits, apply state); returns unsubscribe. */
	subscribe(listener: () => void): () => void;
}

export class HostUciStore implements UciView {
	readonly host: HostUciLike;
	#version = $state(0);
	#unsubscribe: () => void;

	constructor(host: HostUciLike) {
		this.host = host;
		this.#unsubscribe = host.subscribe(() => this.#version++);
	}

	#track(): void {
		void this.#version;
	}

	/** Stop listening to the host (call on unmount). */
	dispose(): void {
		this.#unsubscribe();
	}

	load(...configs: string[]): Promise<void> {
		return this.host.load(...configs);
	}
	isLoaded(config: string): boolean {
		this.#track();
		return this.host.isLoaded(config);
	}
	get(config: string, section: string, option: string): UciValue | undefined {
		this.#track();
		return this.host.get(config, section, option);
	}
	getBase(config: string, section: string, option: string): UciValue | undefined {
		this.#track();
		return this.host.getBase(config, section, option);
	}
	getSection(config: string, section: string): Section | undefined {
		this.#track();
		return this.host.getSection(config, section);
	}
	sections(config: string, type?: string): Section[] {
		this.#track();
		return this.host.sections(config, type);
	}
	resolve(ref: string): ResolvedRef | undefined {
		this.#track();
		return this.host.resolve(ref);
	}
	set(config: string, section: string, option: string, value: UciValue | null | undefined): void {
		this.host.set(config, section, option, value);
	}
	add(
		config: string,
		type: string,
		name?: string,
		values?: Record<string, UciValue>,
		opts?: { draft?: boolean },
	): string {
		return this.host.add(config, type, name, values, opts);
	}
	confirmDraft(config: string, section: string): void {
		// Hosts before app-sdk 0.3 have no drafts: their add() staged already.
		this.host.confirmDraft?.(config, section);
	}
	remove(config: string, section: string): void {
		this.host.remove(config, section);
	}
	order(config: string, sections: string[]): void {
		this.host.order(config, sections);
	}
	get busy(): boolean {
		this.#track();
		return this.host.busy;
	}
	canWrite(config: string): boolean {
		return this.host.canWrite(config);
	}
}
