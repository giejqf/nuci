// SPDX-License-Identifier: Apache-2.0
// Typed wrappers for nuci.https-dns-proxy (AGENTS.md rule 5; fixture:
// docs/ubus-contracts/nuci.https-dns-proxy.json).

import type { HostContext } from '@nuci/app-sdk';

export interface Instance {
	name: string;
	running: boolean;
	pid: number | null;
	resolver: string | null;
	listen_addr: string;
	listen_port: number | null;
	bootstrap: string | null;
	force_dns: boolean;
}
export interface Job {
	name: string;
	running: boolean;
	command?: string;
	log?: string;
	rc?: number | null;
}
export interface Status {
	/** Started at boot (init script enabled). */
	enabled: boolean;
	running: boolean;
	instances: Instance[];
	force_dns: boolean;
	dnsmasq: { section: string; doh_servers: string[]; noresolv: boolean }[];
	job: Job;
}
export type Action = 'start' | 'stop' | 'restart' | 'enable' | 'disable';

export const dohApi = (host: HostContext) => ({
	status: () => host.call<Status>('nuci.https-dns-proxy', 'status'),
	service: (action: Action) => host.call<Job>('nuci.https-dns-proxy', 'service', { action }),
});
