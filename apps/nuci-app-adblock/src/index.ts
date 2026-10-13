// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-adblock: DNS blocklists (services/adblock).

import { registerSveltePage } from '@nuci/app-kit';
import Adblock from './Adblock.svelte';
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
	id: 'adblock',
	path: 'services/adblock',
	title: 'Adblock',
	titleKey: 'adblock.nav',
	component: Adblock,
	css,
	messages,
});
