// SPDX-License-Identifier: Apache-2.0
//
// Theme state (D15): stock DaisyUI light/dark, following the system
// preference unless the user picked one; the override lives in localStorage.

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'nuci.theme';

function readStored(): ThemePreference {
	try {
		const v = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
		return v === 'light' || v === 'dark' ? v : 'system';
	} catch {
		return 'system';
	}
}

function systemPrefersDark(): boolean {
	return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

class ThemeState {
	preference = $state<ThemePreference>(readStored());
	#systemDark = $state(systemPrefersDark());

	resolved: ResolvedTheme = $derived(
		this.preference === 'system' ? (this.#systemDark ? 'dark' : 'light') : this.preference,
	);

	constructor() {
		globalThis
			.matchMedia?.('(prefers-color-scheme: dark)')
			.addEventListener?.('change', (e) => (this.#systemDark = e.matches));
	}

	set(pref: ThemePreference): void {
		this.preference = pref;
		try {
			if (pref === 'system') globalThis.localStorage?.removeItem(THEME_STORAGE_KEY);
			else globalThis.localStorage?.setItem(THEME_STORAGE_KEY, pref);
		} catch {
			// Storage may be unavailable (private mode); the choice still applies to this tab.
		}
		applyTheme(this.resolved);
	}

	/** Cycle light → dark → system. */
	cycle(): void {
		const order: ThemePreference[] = ['light', 'dark', 'system'];
		this.set(order[(order.indexOf(this.preference) + 1) % order.length] ?? 'system');
	}
}

export function applyTheme(theme: ResolvedTheme): void {
	if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
}

export const theme = new ThemeState();
