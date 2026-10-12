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

export async function probe(): Promise<boolean> {
	try {
		await probeClient.callAnonymous('system', 'board');
		return true;
	} catch {
		return false;
	}
}
