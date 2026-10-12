// SPDX-License-Identifier: Apache-2.0
//
// The v1 route table. Each page is its own lazy chunk; `acl` is the rpcd
// access group the sidebar requires (rpcd/acl.d/nuci-base.json).

import type { Component } from 'svelte';
import { Activity, Flame, Network, Puzzle, Settings } from '@lucide/svelte';

export type Group = 'status' | 'system' | 'network' | 'firewall' | 'services';

export interface PageRoute {
	path: string;
	/** i18n key */
	title: string;
	group: Group;
	order: number;
	acl: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- page components take no common props
	load: () => Promise<{ default: Component<any> }>;
}

export const groups: { id: Group; title: string; icon: Component }[] = [
	{ id: 'status', title: 'nav.status', icon: Activity },
	{ id: 'system', title: 'nav.system', icon: Settings },
	{ id: 'network', title: 'nav.network', icon: Network },
	{ id: 'firewall', title: 'nav.firewall', icon: Flame },
	{ id: 'services', title: 'nav.services', icon: Puzzle },
];

export const routes: PageRoute[] = [
	{
		path: 'status/overview',
		title: 'nav.status.overview',
		group: 'status',
		order: 10,
		acl: 'nuci-status',
		load: () => import('../pages/status/Overview.svelte'),
	},
];

export const DEFAULT_PATH = 'status/overview';
