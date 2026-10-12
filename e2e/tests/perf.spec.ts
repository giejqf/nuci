// SPDX-License-Identifier: Apache-2.0
// Nightly perf check (AGENTS.md §8): cold load of login and the Status
// overview on a throttled profile equivalent to Lighthouse's mobile preset
// (4x CPU slowdown, 1.6 Mbit/s, 150 ms RTT), driven through CDP.
// Runs only with NUCI_E2E_PERF=1 so the per-push suite stays fast.

import { expect, test } from '@playwright/test';
import { rootPassword } from '../lib/router';

test.skip(process.env.NUCI_E2E_PERF !== '1', 'perf runs nightly (NUCI_E2E_PERF=1)');

/** Budgets in ms, measured from navigation start. */
const LOGIN_INTERACTIVE = 4_000;
const OVERVIEW_READY = 6_000;

test('throttled cold load: login form and overview within budget', async ({ page }) => {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Network.enable');
	await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
	await cdp.send('Network.emulateNetworkConditions', {
		offline: false,
		latency: 150,
		downloadThroughput: (1.6 * 1024 * 1024) / 8,
		uploadThroughput: (750 * 1024) / 8,
	});
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

	const start = Date.now();
	await page.goto('/nuci/');
	const password = page.getByLabel('Password');
	await expect(password).toBeEditable({ timeout: 30_000 });
	const loginMs = Date.now() - start;

	await password.fill(rootPassword());
	const t1 = Date.now();
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByTestId('overview-cpu')).toBeVisible({ timeout: 30_000 });
	const overviewMs = Date.now() - t1;

	const lcp = await page.evaluate(
		() =>
			new Promise<number>((resolve) => {
				new PerformanceObserver((list) => {
					const entries = list.getEntries();
					resolve(entries[entries.length - 1]?.startTime ?? 0);
				}).observe({ type: 'largest-contentful-paint', buffered: true });
				setTimeout(() => resolve(0), 2000);
			}),
	);
	test.info().annotations.push({
		type: 'perf',
		description: `login interactive ${loginMs} ms, overview ${overviewMs} ms, LCP ${Math.round(lcp)} ms`,
	});
	console.log(
		`[perf] login interactive ${loginMs} ms, overview after login ${overviewMs} ms, LCP ${Math.round(lcp)} ms`,
	);
	expect(loginMs).toBeLessThan(LOGIN_INTERACTIVE);
	expect(overviewMs).toBeLessThan(OVERVIEW_READY);
});
