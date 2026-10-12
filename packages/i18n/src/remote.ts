// SPDX-License-Identifier: Apache-2.0
//
// Drop-in replacement for @nuci/i18n inside nuci-apps (ADR-0004). The app
// build aliases `@nuci/i18n` to this module, so bundled components translate
// through the host: its catalogs, its active locale, no second English copy.

import type { Catalog, Params } from './index';

export type { Catalog, Params };

export interface I18nHost {
	t(key: string, params?: Params): string;
	addMessages(locale: string, messages: Catalog): void;
	readonly locale: string;
}

let host: I18nHost | null = null;

/** Route translations to the host (done by @nuci/app-kit's mountApp). */
export function bindHost(h: I18nHost): void {
	host = h;
}

export function t(key: string, params?: Params): string {
	return host ? host.t(key, params) : key;
}

export function addCatalog(locale: string, messages: Catalog): void {
	host?.addMessages(locale, messages);
}

/** The host owns the locale; apps cannot switch it. */
export function setLocale(_locale: string): void {}

export function getLocale(): string {
	return host?.locale ?? 'en';
}
