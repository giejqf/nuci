// SPDX-License-Identifier: Apache-2.0
// Typed wrappers for nuci.ddns (AGENTS.md rule 5; fixture: docs/ubus-contracts/nuci.ddns.json).

import type { HostContext } from '@nuci/app-sdk';

export interface Provider {
	name: string;
	ipv4: boolean;
	ipv6: boolean;
}
export interface ServiceStatus {
	running: boolean;
	registered_ip: string | null;
	/** Epoch seconds. */
	last_update: number | null;
	next_check: number | null;
}

export const ddnsApi = (host: HostContext) => ({
	providers: async () =>
		(await host.call<{ providers: Provider[] }>('nuci.ddns', 'providers')).providers,
	status: async () =>
		(await host.call<{ services: Record<string, ServiceStatus> }>('nuci.ddns', 'status'))
			.services,
	log: async (section: string) =>
		(await host.call<{ text: string }>('nuci.ddns', 'log', { section })).text,
	/** Restart the ddns services (detached job). */
	update: () => host.call('nuci.ddns', 'update'),
});
