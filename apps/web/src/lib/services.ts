// SPDX-License-Identifier: Apache-2.0
//
// App-wide singletons: the ubus client + typed API, the uci store, and the
// connectivity probe used by the apply protocol.

import { createRpc, RpcClient } from '@nuci/rpc';
import { UciModel, UciStore } from '@nuci/uci';

export const rpc = createRpc();

export const uci = new UciStore(new UciModel(rpc.uci));

// A separate client with a short timeout: probing must fail fast while the
// router reloads its network (ADR-0002).
const probeClient = new RpcClient({ storage: null, timeoutMs: 3000 });

/**
 * Apply-protocol probe (ADR-0002). /nuci/probe reports whether the address
 * this connection arrived on is still assigned: a reused keep-alive
 * connection survives an address change, so plain reachability could
 * confirm a configuration that locked out every new connection.
 */
export async function probe(): Promise<boolean> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 3000);
	try {
		const res = await fetch(new URL('probe', document.baseURI), {
			cache: 'no-store',
			signal: ctrl.signal,
		});
		if (res.ok) return ((await res.json()) as { ok?: boolean }).ok === true;
		if (res.status !== 404) return false;
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
	// Handler not installed: fall back to reachability.
	try {
		await probeClient.callAnonymous('system', 'board');
		return true;
	} catch {
		return false;
	}
}
