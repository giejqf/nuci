// SPDX-License-Identifier: Apache-2.0
//
// Context shared by NuCI components: the uci store, write permissions and
// the apply settings. Set once by the app shell.

import { getContext, setContext } from 'svelte';
import type { ApplyOptions, UciStore, UciView } from '@nuci/uci';

export interface NuciContext {
	/** The host shell passes its UciStore; nuci-apps pass a HostUciStore. */
	uci: UciView;
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

/** Context map for `mount(Component, { context })` outside a component tree (apps). */
export function nuciContextMap(ctx: NuciContext): Map<unknown, unknown> {
	return new Map<unknown, unknown>([[KEY, ctx]]);
}

/** The full store; only the host shell's components (ApplyBar) need it. */
export function hostStore(ctx: NuciContext): UciStore {
	if (!('applyAll' in ctx.uci)) throw new Error('ApplyBar needs the host UciStore');
	return ctx.uci as UciStore;
}
