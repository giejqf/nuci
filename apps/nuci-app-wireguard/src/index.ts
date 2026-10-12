// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-wireguard: WireGuard tunnels (netifd proto wireguard), peers and
// peer configuration export with QR code.

import { registerSveltePage } from '@nuci/app-kit';
import css from './app.css?inline';
import en from './en.json';
import WireGuard from './WireGuard.svelte';

// Translations ship with the app (locales/<locale>.json); English is the source.
const locales = import.meta.glob<Record<string, string>>('./locales/*.json', {
	eager: true,
	import: 'default',
});
const messages: Record<string, Record<string, string>> = { en };
for (const [path, catalog] of Object.entries(locales))
	messages[path.replace(/^.*\/(.+)\.json$/, '$1')] = catalog;

registerSveltePage({
	id: 'wireguard',
	path: 'network/wireguard',
	title: 'WireGuard',
	component: WireGuard,
	css,
	messages,
});
