// SPDX-License-Identifier: Apache-2.0
// Typed wrappers for nuci.nlbwmon (AGENTS.md rule 5; fixture: docs/ubus-contracts/nuci.nlbwmon.json).

import type { HostContext } from '@nuci/app-sdk';

export interface Counters {
	conns: number;
	/** Received by the client (download). */
	rx_bytes: number;
	rx_pkts: number;
	/** Sent by the client (upload). */
	tx_bytes: number;
	tx_pkts: number;
}
export interface ClientProtocol extends Counters {
	/** Protocol name, "PROTO/port", or null for the sum of the rest. */
	name: string | null;
}
export interface Client extends Counters {
	mac: string;
	hostname?: string;
	ips: string[];
	/** Biggest protocols first. */
	protocols: ClientProtocol[];
}
export interface Protocol extends Counters {
	name: string;
	/** Number of clients that used it. */
	clients: number;
}
export interface Traffic {
	/** Start date of the period, null for the current one. */
	period: string | null;
	running: boolean;
	clients: Client[];
	protocols: Protocol[];
}

export const nlbwmonApi = (host: HostContext) => ({
	periods: () => host.call<{ running: boolean; periods: string[] }>('nuci.nlbwmon', 'periods'),
	data: (period?: string) => host.call<Traffic>('nuci.nlbwmon', 'data', period ? { period } : {}),
});
