// SPDX-License-Identifier: Apache-2.0
// Typed wrappers for nuci.frpc (AGENTS.md rule 5; fixture: docs/ubus-contracts/nuci.frpc.json).

import type { HostContext } from '@nuci/app-sdk';

export interface Proxy {
	name: string;
	type: string;
	/** frp's state: "running", "new", "wait start", "start error", "check failed", "closed". */
	status: string;
	error: string;
	local_addr: string;
	remote_addr: string;
}
export interface LogLine {
	time: string | null;
	/** frp's level letter: I, W, E, D, T. */
	level: string | null;
	text: string;
}
export interface Job {
	name: string;
	running: boolean;
	log?: string;
	rc?: number | null;
}
export interface Status {
	enabled: boolean;
	running: boolean;
	/** The admin API is configured (proxy states need it). */
	admin: boolean;
	proxies: Proxy[] | null;
	log: LogLine[];
	job: Job;
}
export type Action = 'start' | 'stop' | 'restart' | 'enable' | 'disable';

export const frpcApi = (host: HostContext) => ({
	status: () => host.call<Status>('nuci.frpc', 'status'),
	service: (action: Action) => host.call<Job>('nuci.frpc', 'service', { action }),
});
