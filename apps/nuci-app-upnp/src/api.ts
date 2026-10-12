// SPDX-License-Identifier: Apache-2.0
// Typed wrappers for nuci.upnp (AGENTS.md rule 5; fixture: docs/ubus-contracts/nuci.upnp.json).

import type { HostContext } from '@nuci/app-sdk';

export interface Redirect {
	proto: string;
	external_port: number;
	client: string;
	internal_port: number;
	/** Epoch seconds; 0 or null: permanent. */
	expires: number | null;
	description: string;
}

export const upnpApi = (host: HostContext) => ({
	status: () => host.call<{ running: boolean; redirects: Redirect[] }>('nuci.upnp', 'status'),
});
