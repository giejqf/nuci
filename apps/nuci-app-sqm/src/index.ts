// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-sqm: SQM QoS (network/sqm).

import { registerSveltePage } from '@nuci/app-kit';
import css from './app.css?inline';
import en from './en.json';
import Sqm from './Sqm.svelte';

// Translations ship with the app (locales/<locale>.json); English is the source.
const locales = import.meta.glob<Record<string, string>>('./locales/*.json', {
	eager: true,
	import: 'default',
});
const messages: Record<string, Record<string, string>> = { en };
for (const [path, catalog] of Object.entries(locales))
	messages[path.replace(/^.*\/(.+)\.json$/, '$1')] = catalog;

registerSveltePage({
	id: 'sqm',
	path: 'network/sqm',
	title: 'SQM QoS',
	titleKey: 'sqm.nav',
	component: Sqm,
	css,
	messages,
});
