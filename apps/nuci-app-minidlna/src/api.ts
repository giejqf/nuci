// SPDX-License-Identifier: Apache-2.0
// Typed wrappers for nuci.minidlna (AGENTS.md rule 5; fixture: docs/ubus-contracts/nuci.minidlna.json).

import type { HostContext } from '@nuci/app-sdk';

export interface Client {
	type: string;
	ip: string;
	mac: string;
	connections: number;
}
export interface Library {
	version: string | null;
	audio: number | null;
	video: number | null;
	image: number | null;
	clients: Client[];
}
export interface Status {
	running: boolean;
	port: number;
	/** From minidlna's status page; null while stopped or not answering. */
	library: Library | null;
	job: { name: string; running: boolean; rc?: number | null };
}

export const minidlnaApi = (host: HostContext) => ({
	status: () => host.call<Status>('nuci.minidlna', 'status'),
	rescan: () => host.call<{ name: string; running: boolean }>('nuci.minidlna', 'rescan'),
});
