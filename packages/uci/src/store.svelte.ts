// SPDX-License-Identifier: Apache-2.0
//
// Svelte 5 reactive wrapper around UciModel: every read registers a
// dependency on one version signal that bumps whenever the model changes.

import { applyChanges, type ApplyOptions, type ApplyState } from './apply';
import type { Change, Section, UciModel, UciValue } from './model';

export class UciStore {
	readonly model: UciModel;
	#version = $state(0);
	apply = $state<ApplyState>({ phase: 'idle' });

	constructor(model: UciModel) {
		this.model = model;
		model.subscribe(() => this.#version++);
	}

	#track(): void {
		void this.#version;
	}

	load(...configs: string[]): Promise<void> {
		return this.model.load(...configs);
	}

	isLoaded(config: string): boolean {
		this.#track();
		return this.model.isLoaded(config);
	}

	get(config: string, section: string, option: string): UciValue | undefined {
		this.#track();
		return this.model.get(config, section, option);
	}

	getSection(config: string, section: string): Section | undefined {
		this.#track();
		return this.model.getSection(config, section);
	}

	sections(config: string, type?: string): Section[] {
		this.#track();
		return this.model.sections(config, type);
	}

	resolve(ref: string) {
		this.#track();
		return this.model.resolve(ref);
	}

	set(config: string, section: string, option: string, value: UciValue | null | undefined): void {
		this.model.set(config, section, option, value);
	}

	add(config: string, type: string, name?: string, values?: Record<string, UciValue>): string {
		return this.model.add(config, type, name, values);
	}

	remove(config: string, section: string): void {
		this.model.remove(config, section);
	}

	order(config: string, sections: string[]): void {
		this.model.order(config, sections);
	}

	get changes(): Change[] {
		this.#track();
		return this.model.changes();
	}

	get dirty(): boolean {
		this.#track();
		return this.model.dirty;
	}

	get pending() {
		this.#track();
		return this.model.pending;
	}

	get pendingCount(): number {
		this.#track();
		return this.model.pendingCount;
	}

	/** Local edits plus saved-but-unapplied changes (the "unsaved changes" badge). */
	get totalChanges(): number {
		this.#track();
		return this.model.changes().length + this.model.pendingCount;
	}

	get busy(): boolean {
		return ['saving', 'applying', 'confirming'].includes(this.apply.phase);
	}

	revertLocal(config?: string): void {
		this.model.revertLocal(config);
	}

	revertPending(configs?: string[]): Promise<void> {
		return this.model.revertPending(configs);
	}

	refreshPending(): Promise<void> {
		return this.model.refreshPending();
	}

	save(): Promise<void> {
		return this.model.save();
	}

	async applyAll(opts: Omit<ApplyOptions, 'onState'>): Promise<ApplyState> {
		return applyChanges(this.model, { ...opts, onState: (s) => (this.apply = s) });
	}

	resetApplyState(): void {
		this.apply = { phase: 'idle' };
	}
}
