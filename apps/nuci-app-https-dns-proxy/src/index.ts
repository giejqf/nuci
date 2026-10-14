// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-https-dns-proxy: DNS over HTTPS (services/https-dns-proxy).

import { registerSveltePage } from '@nuci/app-kit';
import Doh from './Doh.svelte';
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
	id: 'https-dns-proxy',
	path: 'services/https-dns-proxy',
	title: 'DNS over HTTPS',
	titleKey: 'doh.nav',
	component: Doh,
	css,
	messages,
});
