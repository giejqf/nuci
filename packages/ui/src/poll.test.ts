// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { poll } from './poll';

describe('poll', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('waits for a slow call before scheduling the next one', async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		let calls = 0;
		const stop = poll(async () => {
			calls++;
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((r) => setTimeout(r, 12_000));
			inFlight--;
		}, 5000);
		await vi.advanceTimersByTimeAsync(30_000);
		stop();
		// 0–12 s, 17–29 s: two calls, never concurrent
		expect(calls).toBe(2);
		expect(maxInFlight).toBe(1);
	});

	it('keeps polling after a failure and stops when told', async () => {
		const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
		const stop = poll(fn, 1000);
		await vi.advanceTimersByTimeAsync(2500);
		expect(fn).toHaveBeenCalledTimes(3);
		stop();
		await vi.advanceTimersByTimeAsync(5000);
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it('skips its turn while the tab is hidden', async () => {
		const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
		const fn = vi.fn();
		const stop = poll(fn, 1000);
		await vi.advanceTimersByTimeAsync(3500);
		expect(fn).not.toHaveBeenCalled();
		state.mockReturnValue('visible');
		await vi.advanceTimersByTimeAsync(1000);
		expect(fn).toHaveBeenCalledTimes(1);
		stop();
		state.mockRestore();
	});
});
