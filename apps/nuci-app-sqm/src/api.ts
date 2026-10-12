// SPDX-License-Identifier: Apache-2.0
// Typed wrappers for nuci.sqm (AGENTS.md rule 5; fixture: docs/ubus-contracts/nuci.sqm.json).

import type { HostContext } from '@nuci/app-sdk';

export interface Qdisc {
	kind: string;
	handle: string;
	root: boolean;
	bandwidth?: string;
	sent_bytes?: number;
	sent_packets?: number;
	dropped?: number;
}
export type SqmStatus = Record<string, { egress: Qdisc[]; ingress: Qdisc[] }>;

export const sqmApi = (host: HostContext) => ({
	status: async () =>
		(await host.call<{ interfaces: SqmStatus }>('nuci.sqm', 'status')).interfaces,
});
