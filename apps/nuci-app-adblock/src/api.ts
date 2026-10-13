// SPDX-License-Identifier: Apache-2.0
// Typed wrappers for nuci.adblock (AGENTS.md rule 5; fixture: docs/ubus-contracts/nuci.adblock.json).

import type { HostContext } from '@nuci/app-sdk';

export interface Job {
	name: string;
	running: boolean;
	command?: string;
	started?: number | null;
	finished?: number | null;
	rc?: number | null;
	log?: string;
}
export interface AdblockStatus {
	/** enabled, disabled, paused, processing, error, stopped; null: never ran. */
	state: string | null;
	blocked: number | null;
	feeds: string[];
	backend: string | null;
	version: string | null;
	/** Local time as adblock logged it; duration in seconds. */
	last_run: { mode: string; time: string; duration: number } | null;
	autostart: boolean;
	job: Job;
	search: Job;
}
export interface Feed {
	name: string;
	descr: string;
	/** S, M, L, XL, XXL or VAR (depends on the categories). */
	size: string;
	host?: string;
	/** uci list option holding the chosen categories (category feeds only). */
	option?: string;
	categories?: { value: string; label: string }[];
}
export type ListName = 'allow' | 'block';

export const adblockApi = (host: HostContext) => ({
	status: () => host.call<AdblockStatus>('nuci.adblock', 'status'),
	feeds: () => host.call<{ custom: boolean; feeds: Feed[] }>('nuci.adblock', 'feeds'),
	lists: () => host.call<Record<ListName, string[]>>('nuci.adblock', 'lists'),
	run: (action: 'reload' | 'restart' | 'suspend' | 'resume') =>
		host.call<Job>('nuci.adblock', 'run', { action }),
	/** Replace a local list and reload adblock (job null: a run was already busy). */
	setList: (list: ListName, domains: string[]) =>
		host.call<{ job: Job | null }>('nuci.adblock', 'set_list', { list, domains }),
	search: (domain: string) => host.call<Job>('nuci.adblock', 'search', { domain }),
});

/** Same rule as the router (nuci.app.adblock valid_domain). */
const LABEL = '[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?';
const DOMAIN_RE = new RegExp(`^(${LABEL}\\.)*${LABEL}$`);
export const validDomain = (d: string) => d.length <= 253 && DOMAIN_RE.test(d);
