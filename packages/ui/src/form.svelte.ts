// SPDX-License-Identifier: Apache-2.0
//
// Form-level validity: fields report their error under a stable id; the
// form (and the ApplyBar) can tell whether everything is valid.

import { getContext, setContext, untrack } from 'svelte';

const KEY = Symbol('nuci-form');

export class FormState {
	errors = $state<Record<string, string>>({});

	get valid(): boolean {
		return Object.keys(this.errors).length === 0;
	}

	/** Called from field effects: must not make them depend on `errors`. */
	report(id: string, error: string | null): void {
		untrack(() => {
			if (error) {
				if (this.errors[id] !== error) this.errors[id] = error;
			} else if (id in this.errors) {
				delete this.errors[id];
			}
		});
	}
}

/** Every mounted form; the ApplyBar refuses to save while one is invalid. */
class FormRegistry {
	forms = $state<FormState[]>([]);

	get valid(): boolean {
		return this.forms.every((f) => f.valid);
	}

	add(f: FormState): () => void {
		untrack(() => this.forms.push(f));
		return () => untrack(() => (this.forms = this.forms.filter((x) => x !== f)));
	}
}

export const forms = new FormRegistry();

export function setFormContext(f: FormState): FormState {
	return setContext(KEY, f);
}

export function getFormContext(): FormState | undefined {
	return getContext<FormState | undefined>(KEY);
}

let nextId = 0;
export function uid(prefix = 'nuci'): string {
	return `${prefix}-${++nextId}`;
}
