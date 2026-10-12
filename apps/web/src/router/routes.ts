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
	/** Not listed in the sidebar (e.g. detail pages with params). */
	hidden?: boolean;
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
	{
		path: 'status/syslog',
		title: 'nav.status.syslog',
		group: 'status',
		order: 20,
		acl: 'nuci-status',
		load: () => import('../pages/status/SystemLog.svelte'),
	},
	{
		path: 'status/kernlog',
		title: 'nav.status.kernlog',
		group: 'status',
		order: 30,
		acl: 'nuci-status',
		load: () => import('../pages/status/KernelLog.svelte'),
	},
	{
		path: 'status/processes',
		title: 'nav.status.processes',
		group: 'status',
		order: 40,
		acl: 'nuci-status',
		load: () => import('../pages/status/Processes.svelte'),
	},
	{
		path: 'status/realtime',
		title: 'nav.status.realtime',
		group: 'status',
		order: 50,
		acl: 'nuci-status',
		load: () => import('../pages/status/Realtime.svelte'),
	},
	{
		path: 'system/general',
		title: 'nav.system.general',
		group: 'system',
		order: 10,
		acl: 'nuci-system',
		load: () => import('../pages/system/General.svelte'),
	},
	{
		path: 'system/admin',
		title: 'nav.system.admin',
		group: 'system',
		order: 20,
		acl: 'nuci-admin',
		load: () => import('../pages/system/Administration.svelte'),
	},
	{
		path: 'system/software',
		title: 'nav.system.software',
		group: 'system',
		order: 30,
		acl: 'nuci-software',
		load: () => import('../pages/system/Software.svelte'),
	},
	{
		path: 'system/startup',
		title: 'nav.system.startup',
		group: 'system',
		order: 40,
		acl: 'nuci-system',
		load: () => import('../pages/system/Startup.svelte'),
	},
	{
		path: 'system/backup',
		title: 'nav.system.backup',
		group: 'system',
		order: 50,
		acl: 'nuci-backup',
		load: () => import('../pages/system/Backup.svelte'),
	},
	{
		path: 'system/reboot',
		title: 'nav.system.reboot',
		group: 'system',
		order: 60,
		acl: 'nuci-system',
		load: () => import('../pages/system/Reboot.svelte'),
	},
	{
		path: 'network/interfaces',
		title: 'nav.network.interfaces',
		group: 'network',
		order: 10,
		acl: 'nuci-network',
		load: () => import('../pages/network/Interfaces.svelte'),
	},
	{
		path: 'network/interfaces/:name',
		title: 'nav.network.interfaces',
		group: 'network',
		order: 11,
		acl: 'nuci-network',
		hidden: true,
		load: () => import('../pages/network/InterfaceEdit.svelte'),
	},
	{
		path: 'network/devices',
		title: 'nav.network.devices',
		group: 'network',
		order: 20,
		acl: 'nuci-network',
		load: () => import('../pages/network/Devices.svelte'),
	},
	{
		path: 'network/wireless',
		title: 'nav.network.wireless',
		group: 'network',
		order: 30,
		acl: 'nuci-network',
		load: () => import('../pages/network/Wireless.svelte'),
	},
	{
		path: 'network/dhcp',
		title: 'nav.network.dhcp',
		group: 'network',
		order: 40,
		acl: 'nuci-network',
		load: () => import('../pages/network/Dhcp.svelte'),
	},
	{
		path: 'network/hostnames',
		title: 'nav.network.hostnames',
		group: 'network',
		order: 50,
		acl: 'nuci-network',
		load: () => import('../pages/network/Hostnames.svelte'),
	},
	{
		path: 'network/routes',
		title: 'nav.network.routes',
		group: 'network',
		order: 60,
		acl: 'nuci-network',
		load: () => import('../pages/network/Routes.svelte'),
	},
	{
		path: 'network/diagnostics',
		title: 'nav.network.diagnostics',
		group: 'network',
		order: 70,
		acl: 'nuci-network',
		load: () => import('../pages/network/Diagnostics.svelte'),
	},
	{
		path: 'firewall/general',
		title: 'nav.firewall.general',
		group: 'firewall',
		order: 10,
		acl: 'nuci-firewall',
		load: () => import('../pages/firewall/General.svelte'),
	},
	{
		path: 'firewall/zones',
		title: 'nav.firewall.zones',
		group: 'firewall',
		order: 20,
		acl: 'nuci-firewall',
		load: () => import('../pages/firewall/Zones.svelte'),
	},
	{
		path: 'firewall/forwards',
		title: 'nav.firewall.forwards',
		group: 'firewall',
		order: 30,
		acl: 'nuci-firewall',
		load: () => import('../pages/firewall/Forwards.svelte'),
	},
	{
		path: 'firewall/rules',
		title: 'nav.firewall.rules',
		group: 'firewall',
		order: 40,
		acl: 'nuci-firewall',
		load: () => import('../pages/firewall/Rules.svelte'),
	},
	{
		path: 'firewall/nat',
		title: 'nav.firewall.nat',
		group: 'firewall',
		order: 50,
		acl: 'nuci-firewall',
		load: () => import('../pages/firewall/Nat.svelte'),
	},
];

export const DEFAULT_PATH = 'status/overview';
