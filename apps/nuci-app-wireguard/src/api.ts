// SPDX-License-Identifier: Apache-2.0
// Typed wrappers for nuci.wireguard (AGENTS.md rule 5; fixture: docs/ubus-contracts/nuci.wireguard.json).

import type { HostContext } from '@nuci/app-sdk';

export interface PeerStatus {
	public_key: string;
	preshared_key: boolean;
	endpoint: string | null;
	allowed_ips: string[];
	/** Epoch seconds, 0: never. */
	latest_handshake: number;
	rx_bytes: number;
	tx_bytes: number;
	persistent_keepalive: number;
}
export interface TunnelStatus {
	public_key: string;
	listen_port: number;
	fwmark: string | null;
	peers: PeerStatus[];
}

export const wgApi = (host: HostContext) => ({
	status: async () =>
		(await host.call<{ interfaces: Record<string, TunnelStatus> }>('nuci.wireguard', 'status'))
			.interfaces,
	genkey: () =>
		host.call<{ private_key: string; public_key: string }>('nuci.wireguard', 'genkey'),
	genpsk: () => host.call<{ preshared_key: string }>('nuci.wireguard', 'genpsk'),
	pubkey: (privateKey: string) =>
		host.call<{ public_key: string }>('nuci.wireguard', 'pubkey', { private_key: privateKey }),
});
