// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-wol: Wake on LAN (services/wol).

import { registerSveltePage } from '@nuci/app-kit';
import Wol from './Wol.svelte';
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
	id: 'wol',
	path: 'services/wol',
	title: 'Wake on LAN',
	titleKey: 'wol.nav',
	component: Wol,
	css,
	messages,
});
