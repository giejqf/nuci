// SPDX-License-Identifier: Apache-2.0
//
// @nuci/rpc — ubus JSON-RPC client, typed wrappers, ACLs and realtime events.
// Framework-free: no Svelte imports here (AGENTS.md §10.3).

import { createApi, type Api } from './api';
import { RpcClient, type ClientOptions } from './client';
import { EventHub, type EventHubOptions } from './events';

export { Acl } from './acl';
export { createApi, type Api, type UciSetValues } from './api';
export {
	NULL_SESSION,
	RpcClient,
	SESSION_STORAGE_KEY,
	type Args,
	type ClientOptions,
} from './client';
export { isRpcError, JsonRpcCode, RpcError, UbusStatus, type RpcErrorKind } from './errors';
export {
	EventHub,
	type EventHubOptions,
	type Poller,
	type StreamName,
	type StreamParams,
	type StreamPayloads,
	type SubscribeOptions,
	type Transport,
} from './events';
export type * from './nuci-types';
export type * from './types';

export interface Rpc extends Api {
	client: RpcClient;
	events: EventHub;
}

export interface RpcOptions extends ClientOptions {
	events?: Omit<EventHubOptions, 'getSid' | 'pollers'> & { pollers?: EventHubOptions['pollers'] };
}

/** Client + typed API + event hub with ubus pollers for the standard streams. */
export function createRpc(options: RpcOptions = {}): Rpc {
	const client = new RpcClient(options);
	const api = createApi(client);
	const events = new EventHub({
		...options.events,
		getSid: () => client.sid,
		pollers: {
			heartbeat: async () => {
				const info = await api.system.info();
				return { t: info.localtime, uptime: info.uptime };
			},
			stats: () => api.nuci.status.realtime(),
			...options.events?.pollers,
		},
	});
	client.onSessionChange(() => events.reset());
	return { ...api, client, events };
}
