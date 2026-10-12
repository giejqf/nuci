// SPDX-License-Identifier: Apache-2.0
//
// Pick a UI language: the user's stored choice, else the browser's. Locale
// catalogs (packages/i18n/locales/<locale>.json, created with
// `pnpm i18n:template <locale>`) are lazy chunks; missing keys and empty
// strings fall back to English (D12).

import { addCatalog, setLocale } from '@nuci/i18n';

const catalogs = import.meta.glob<{ default: Record<string, string> }>(
	'../../../../packages/i18n/locales/*.json',
);
export const LOCALE_KEY = 'nuci.locale';

export function availableLocales(): string[] {
	return ['en', ...Object.keys(catalogs).map((p) => p.replace(/^.*\/([^/]+)\.json$/, '$1'))];
}

export async function initLocale(
	preferred: readonly string[] = navigator.languages ?? [navigator.language],
): Promise<string> {
	let stored: string | null = null;
	try {
		stored = localStorage.getItem(LOCALE_KEY);
	} catch {
		// storage unavailable
	}
	const available = availableLocales();
	const wanted = [stored, ...preferred].filter((l): l is string => !!l);
	const pick =
		wanted
			.map(
				(l) =>
					available.find((a) => a === l) ?? available.find((a) => a === l.split('-')[0]),
			)
			.find(Boolean) ?? 'en';
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
