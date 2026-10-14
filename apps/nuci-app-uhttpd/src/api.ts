// SPDX-License-Identifier: Apache-2.0
// Typed wrappers for nuci.uhttpd (AGENTS.md rule 5; fixture: docs/ubus-contracts/nuci.uhttpd.json).

import type { HostContext } from '@nuci/app-sdk';

export interface Instance {
	name: string;
	running: boolean;
	http: string[];
	https: string[];
}
export interface Certificate {
	path: string;
	/** The file does not exist (yet). */
	missing?: boolean;
	format?: 'pem' | 'der';
	serial?: string;
	subject?: string;
	issuer?: string;
	self_signed?: boolean;
	/** Epoch seconds. */
	not_before?: number | null;
	not_after?: number | null;
	/** "EC P-256", "RSA 2048", … */
	key?: string | null;
}
export interface Status {
	running: boolean;
	instances: Instance[];
	cert: Certificate | null;
	/** px5g or openssl: what uhttpd makes certificates with; null: none installed. */
	generator: string | null;
	job: { name: string; running: boolean; rc?: number | null };
}

export const uhttpdApi = (host: HostContext) => ({
	status: () => host.call<Status>('nuci.uhttpd', 'status'),
	regenerate: () => host.call<{ name: string; running: boolean }>('nuci.uhttpd', 'regenerate'),
});
