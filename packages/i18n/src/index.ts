// SPDX-License-Identifier: Apache-2.0
//
// Key-based message catalogs. English (en.json) is the source catalog; other
// languages are partial overlays that fall back to English key by key.

import en from '../en.json';

export type Catalog = Record<string, string>;
export type Params = Record<string, string | number>;

const catalogs = new Map<string, Catalog>([['en', en]]);
let active: Catalog = en;
let activeLocale = 'en';

/** Register (or extend) the catalog for a locale. */
export function addCatalog(locale: string, messages: Catalog): void {
	catalogs.set(locale, { ...catalogs.get(locale), ...messages });
	if (locale === activeLocale) active = catalogs.get(locale) ?? en;
}

/** Switch the active locale; unknown locales fall back to English. */
export function setLocale(locale: string): void {
	activeLocale = catalogs.has(locale) ? locale : 'en';
	active = catalogs.get(activeLocale) ?? en;
}

export function getLocale(): string {
	return activeLocale;
}

/**
 * Translate a key, interpolating `{name}` placeholders from `params`.
 * Missing keys return the key itself so gaps are visible, never blank.
 */
export function t(key: string, params?: Params): string {
	const msg = active[key] ?? (en as Catalog)[key] ?? key;
	if (!params) return msg;
	return msg.replace(/\{(\w+)\}/g, (m, name: string) =>
		name in params ? String(params[name]) : m,
	);
}
