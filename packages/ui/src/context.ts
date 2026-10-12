// SPDX-License-Identifier: Apache-2.0
//
// Context shared by NuCI components: the uci store, write permissions and
// the apply settings. Set once by the app shell.

import { getContext, setContext } from 'svelte';
import type { UciStore, ApplyOptions } from '@nuci/uci';

export interface NuciContext {
	uci: UciStore;
	/** Whether the session may write `config` (ACL `uci` scope). */
	canWrite?: (config: string) => boolean;
	/** Connectivity probe and defaults for the apply protocol. */
	apply?: Pick<ApplyOptions, 'probe' | 'timeout' | 'holdoffMs' | 'settleMs' | 'shouldConfirm'> & {
		/** Per-apply overrides computed from the staged changes (e.g. an address handoff). */
		prepare?: () => Promise<Partial<ApplyOptions>> | Partial<ApplyOptions>;
		/** Called with the outcome (e.g. to clear a handoff banner). */
		done?: () => void;
	};
}

const KEY = Symbol('nuci');

export function setNuciContext(ctx: NuciContext): NuciContext {
	return setContext(KEY, ctx);
}

export function getNuciContext(): NuciContext {
	const ctx = getContext<NuciContext | undefined>(KEY);
	if (!ctx) throw new Error('NuCI context missing: call setNuciContext() in the app shell');
	return ctx;
}

export function tryNuciContext(): NuciContext | undefined {
	return getContext<NuciContext | undefined>(KEY);
}
