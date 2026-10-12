// SPDX-License-Identifier: Apache-2.0
//
// Pick a UI language: the user's stored choice, else the browser's. Locale
// catalogs (packages/i18n/locales/<locale>.json) are lazy chunks; missing
// keys fall back to English (D12). Switching reloads the page so every
// component renders in the new language.

import { addCatalog, setLocale } from '@nuci/i18n';

const catalogs = import.meta.glob<{ default: Record<string, string> }>(
	'../../../../packages/i18n/locales/*.json',
);
export const LOCALE_KEY = 'nuci.locale';

/** Native names: a language is always offered in its own language. */
export const LANGUAGE_NAMES: Record<string, string> = {
	en: 'English',
	de: 'Deutsch',
	'zh-CN': '简体中文',
};

export function availableLocales(): string[] {
	return ['en', ...Object.keys(catalogs).map((p) => p.replace(/^.*\/([^/]+)\.json$/, '$1'))];
}

/**
 * First wanted tag with a catalog: exact match, else same primary language
 * ("zh", "zh-Hans-CN" -> "zh-CN"; "de-AT" -> "de").
 */
export function matchLocale(wanted: readonly string[], available: readonly string[]): string {
	for (const w of wanted) {
		const exact = available.find((a) => a.toLowerCase() === w.toLowerCase());
		if (exact) return exact;
		const primary = w.split('-')[0]?.toLowerCase();
		const near = available.find((a) => a.split('-')[0]?.toLowerCase() === primary);
		if (near) return near;
	}
	return 'en';
}

function stored(): string | null {
	try {
		return localStorage.getItem(LOCALE_KEY);
	} catch {
		return null;
	}
}

export async function initLocale(
	preferred: readonly string[] = navigator.languages ?? [navigator.language],
): Promise<string> {
	const s = stored();
	const pick = matchLocale([...(s ? [s] : []), ...preferred], availableLocales());
	if (pick !== 'en') {
		const load = Object.entries(catalogs).find(([p]) => p.endsWith(`/${pick}.json`))?.[1];
		if (load) {
			const messages = Object.fromEntries(
				Object.entries((await load()).default).filter(([, v]) => v !== ''),
			);
			addCatalog(pick, messages);
		}
	}
	setLocale(pick);
	document.documentElement.lang = pick;
	return pick;
}

/** Remember the user's choice and reload into it. */
export function switchLocale(locale: string): void {
	try {
		localStorage.setItem(LOCALE_KEY, locale);
	} catch {
		// storage unavailable: the choice lasts for this page only
	}
	location.reload();
}
