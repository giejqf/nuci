// SPDX-License-Identifier: Apache-2.0
//
// The apply protocol (ADR-0002): save → uci apply {rollback, timeout} →
// hold-off → probe connectivity → uci confirm. Without a confirm the router
// restores the previous configuration when the timeout expires.

import { RpcError } from '@nuci/rpc';
import type { UciModel } from './model';

export type ApplyPhase =
	'idle' | 'saving' | 'applying' | 'confirming' | 'confirmed' | 'rolled-back' | 'failed';

export interface ApplyState {
	phase: ApplyPhase;
	/** Seconds until the router rolls back (while confirming). */
	remaining?: number;
	error?: unknown;
}

export interface ApplyOptions {
	/** Arm the rollback timer (default true). `false` = "apply unchecked". */
	rollback?: boolean;
	/** Rollback timeout in seconds (default 90, clamped to [30, 600]). */
	timeout?: number;
	/** Wait before the first probe so reloads have started (default 5000 ms). */
	holdoffMs?: number;
	/** Delay between probes (default 1000 ms). */
	probeIntervalMs?: number;
	/** How long to wait for the router after a rollback (default 60 000 ms). */
	recoveryMs?: number;
	/** Resolves true when the router answers at the address in use. */
	probe: () => Promise<boolean>;
	/**
	 * Gate for confirming (default: always). Return false to withhold the
	 * confirm, e.g. while the UI waits for a handoff to a new address.
	 */
	shouldConfirm?: () => boolean | Promise<boolean>;
	onState?: (state: ApplyState) => void;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
}

const NO_DATA = 5;

function ubusCode(e: unknown): number | undefined {
	return e instanceof RpcError && e.kind === 'ubus' ? e.code : undefined;
}

export function clampTimeout(t: number | undefined): number {
	return Math.min(600, Math.max(30, Math.round(t ?? 90)));
}

/** Run the full apply protocol for the model's local edits and pending changes. */
export async function applyChanges(model: UciModel, opts: ApplyOptions): Promise<ApplyState> {
	const now = opts.now ?? (() => Date.now());
	const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const rollback = opts.rollback ?? true;
	const timeout = clampTimeout(opts.timeout);
	const emit = (s: ApplyState) => {
		opts.onState?.(s);
		return s;
	};

	try {
		emit({ phase: 'saving' });
		if (model.dirty) await model.save();
		else await model.refreshPending();
		if (model.pendingCount === 0) return emit({ phase: 'confirmed' });

		emit({ phase: 'applying' });
		await model.api.apply(rollback, rollback ? timeout : undefined);
	} catch (error) {
		return emit({ phase: 'failed', error });
	}

	if (!rollback) {
		await sleep(opts.holdoffMs ?? 5000);
		await refresh(model);
		return emit({ phase: 'confirmed' });
	}

	const deadline = now() + timeout * 1000;
	const remaining = () => Math.max(0, Math.ceil((deadline - now()) / 1000));
	emit({ phase: 'confirming', remaining: remaining() });
	await sleep(opts.holdoffMs ?? 5000);

	while (now() < deadline) {
		emit({ phase: 'confirming', remaining: remaining() });
		if ((await safe(opts.probe)) && (await (opts.shouldConfirm?.() ?? true))) {
			try {
				await model.api.confirm();
				await refresh(model);
				return emit({ phase: 'confirmed' });
			} catch (e) {
				// NO_DATA: nothing pending any more — the router already rolled back.
				if (ubusCode(e) === NO_DATA) break;
			}
		}
		await sleep(opts.probeIntervalMs ?? 1000);
	}

	// Rolled back (or about to be): wait for the router to answer again.
	emit({ phase: 'confirming', remaining: 0 });
	const until = now() + (opts.recoveryMs ?? 60_000);
	while (now() < until && !(await safe(opts.probe))) await sleep(opts.probeIntervalMs ?? 1000);
	await refresh(model);
	return emit({ phase: 'rolled-back' });
}

async function safe(probe: () => Promise<boolean>): Promise<boolean> {
	try {
		return await probe();
	} catch {
		return false;
	}
}

async function refresh(model: UciModel): Promise<void> {
	try {
		await model.reload();
		await model.refreshPending();
	} catch {
		// The mirror refreshes on the next page load; the outcome stands.
	}
}
