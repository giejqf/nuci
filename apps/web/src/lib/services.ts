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
	// Not shorter: the handler asks netifd, which can take seconds to answer
	// on a slow or busy router (and a refused connection fails at once anyway).
	const timer = setTimeout(() => ctrl.abort(), 8000);
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * After a reboot or flash: wait until the router stops answering, then until
 * it answers again. Resolves true once it is back, false on timeout.
 */
export async function waitForRestart(
	onPhase?: (phase: 'going-down' | 'down' | 'up') => void,
	{ downTimeoutMs = 90_000, upTimeoutMs = 600_000 } = {},
): Promise<boolean> {
	onPhase?.('going-down');
	const t0 = Date.now();
	while (Date.now() - t0 < downTimeoutMs && (await probe())) await sleep(1000);
	onPhase?.('down');
	const t1 = Date.now();
	while (Date.now() - t1 < upTimeoutMs) {
		if (await probe()) {
			onPhase?.('up');
			return true;
		}
		await sleep(2000);
	}
	return false;
}
