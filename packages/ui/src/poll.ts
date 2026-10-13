// SPDX-License-Identifier: Apache-2.0
//
// Periodic refresh for status views. A request never overlaps the previous
// one: on a slow router a fixed interval piles up calls that each hold one
// of uhttpd's request slots (and the browser's per-host connections), which
// starves the apply probe. Hidden tabs skip their turn.

/**
 * Runs `fn` now, then again `intervalMs` after each run has finished while
 * the document is visible. Returns a function that stops polling.
 */
export function poll(fn: () => Promise<unknown> | unknown, intervalMs: number): () => void {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const run = async (): Promise<void> => {
		if (typeof document === 'undefined' || document.visibilityState === 'visible') {
			try {
				await fn();
			} catch {
				// callers report their own errors; polling continues
			}
		}
		if (!stopped) timer = setTimeout(() => void run(), intervalMs);
	};

	void run();
	return () => {
		stopped = true;
		clearTimeout(timer);
	};
}
