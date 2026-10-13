// SPDX-License-Identifier: Apache-2.0
// Typed wrappers for nuci.asu (AGENTS.md rule 5; fixture: docs/ubus-contracts/nuci.asu.json).

import type { HostContext } from '@nuci/app-sdk';

export interface JobStatus {
	name: string;
	running: boolean;
	command?: string;
	started?: number;
	finished?: number;
	rc?: number;
	log?: string;
}

export interface Side {
	version: string;
	revision?: string;
	kernel?: string;
}

export interface CheckSummary {
	from: Side | null;
	to: Side | null;
	device: { target?: string; profile?: string; board?: string };
	branches: Record<string, { latest: string | null; versions: string[] }>;
	changes: { name: string; from: string; to: string }[];
	missing: string[];
	errors: string[];
	warnings: string[];
	/** owut check passed and reported no errors. */
	ok: boolean;
}

export interface AsuStatus {
	job: JobStatus;
	check: CheckSummary | null;
	/** Downloaded and verified image, ready to install. */
	image: { version: string; size: number } | null;
}

export const asuApi = (host: HostContext) => ({
	status: () => host.call<AsuStatus>('nuci.asu', 'status'),
	check: (version?: string) =>
		host.call<JobStatus>('nuci.asu', 'check', version ? { version } : {}),
	download: (version: string) => host.call<JobStatus>('nuci.asu', 'download', { version }),
	install: () => host.call<JobStatus>('nuci.asu', 'install'),
});
