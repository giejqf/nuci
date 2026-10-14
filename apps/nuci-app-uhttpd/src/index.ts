// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-uhttpd: web server settings and certificate (system/uhttpd).

import { registerSveltePage } from '@nuci/app-kit';
import Uhttpd from './Uhttpd.svelte';
import css from './app.css?inline';
import en from './en.json';

// Translations ship with the app (locales/<locale>.json); English is the source.
const locales = import.meta.glob<Record<string, string>>('./locales/*.json', {
	eager: true,
	import: 'default',
});
const messages: Record<string, Record<string, string>> = { en };
for (const [path, catalog] of Object.entries(locales))
	messages[path.replace(/^.*\/(.+)\.json$/, '$1')] = catalog;

registerSveltePage({
	id: 'uhttpd',
	path: 'system/uhttpd',
	title: 'Web server',
	titleKey: 'uhttpd.nav',
	component: Uhttpd,
	css,
	messages,
});
