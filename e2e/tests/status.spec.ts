// SPDX-License-Identifier: Apache-2.0
// Phase 2: every Status page renders real data on the active transport;
// streams pause in hidden tabs.

import { expect, test, type Page } from '@playwright/test';
import { TRANSPORT } from '../lib/transport';
import { login } from '../lib/ui';

async function expectTransport(page: Page) {
	await expect(page.locator('html')).toHaveAttribute('data-transport', TRANSPORT, {
		timeout: 20_000,
	});
}

test('kernel log shows the boot messages', async ({ page }) => {
	await login(page, 'status/kernlog');
	await expect(page.getByRole('heading', { name: 'Kernel log', level: 1 })).toBeVisible();
	await expect(page.getByTestId('kernlog-line').first()).toContainText('Linux version');
	await expectTransport(page);
});

test('processes list real processes with CPU and memory', async ({ page }) => {
	await login(page, 'status/processes');
	const table = page.getByTestId('processes');
	await expect(table.getByRole('row', { name: /procd/ })).toBeVisible();
	await expect(table.getByRole('row', { name: /dnsmasq/ }).first()).toContainText(
		/\d+(\.\d+)? [KM]iB/,
	);
	// CPU share needs two samples
	await expect(table.getByRole('row', { name: /procd/ })).toContainText('%', { timeout: 15_000 });
});

test('system log follows live: HUP to dnsmasq from the Processes page shows up', async ({
	browser,
}) => {
	const ctx = await browser.newContext();
	const logPage = await ctx.newPage();
	await login(logPage, 'status/syslog');
	const lines = logPage.getByTestId('syslog-line');
	await expect(lines.first()).toBeVisible();
	await expectTransport(logPage);
	await logPage.getByLabel('Filter messages').fill('dnsmasq');
	const before = await lines.count();

	// Same session (sessionStorage is per tab, so log in again in the second tab).
	const procPage = await ctx.newPage();
	await login(procPage, 'status/processes');
	const row = procPage
		.getByTestId('processes')
		.getByRole('row', { name: /\/usr\/sbin\/dnsmasq/ })
		.first();
	await row.getByRole('button', { name: /Send HUP/ }).click();
	await procPage.getByTestId('signal-send').click();
	await expect(procPage.getByText(/^Sent HUP to process \d+\.$/)).toBeVisible();

	// dnsmasq logs that it re-read its files; the log page receives it live.
	await expect.poll(() => lines.count(), { timeout: 30_000 }).toBeGreaterThan(before);
	await expect(lines.last()).toContainText('dnsmasq');
	await ctx.close();
});

test('realtime graphs plot load, traffic and connections', async ({ page }) => {
	await login(page, 'status/realtime');
	await expectTransport(page);
	const load = page.getByTestId('chart-load');
	await expect(load.getByTestId('chart-load-value-l1')).toHaveText(/^\d+\.\d\d$/, {
		timeout: 20_000,
	});
	// CPU needs two samples; the table view lists them
	await expect
		.poll(() => page.getByTestId('chart-cpu').locator('tbody tr').count(), { timeout: 20_000 })
		.toBeGreaterThan(2);

	await page.getByRole('tab', { name: 'Traffic' }).click();
	await expect(page.getByTestId('traffic-device')).toHaveValue('br-lan');
	await expect(
		page.getByTestId('traffic-table').getByRole('row', { name: /eth1/ }),
	).toBeVisible();
	await expect(page.getByTestId('chart-traffic-value-rx')).toContainText('bit/s', {
		timeout: 20_000,
	});

	await page.getByRole('tab', { name: 'Wireless' }).click();
	await expect(page.getByTestId('wireless-empty')).toBeVisible();

	await page.getByRole('tab', { name: 'Connections' }).click();
	await expect(page.getByTestId('conntrack-usage')).toContainText('/');
	await expect(
		page.getByTestId('conntrack-table').getByRole('row', { name: /tcp/ }).first(),
	).toBeVisible();
	await expect(page.getByTestId('chart-connections-value-tcp')).toHaveText(/^\d+$/);
});

test('chart crosshair is keyboard accessible', async ({ page }) => {
	await login(page, 'status/realtime');
	const svg = page.getByTestId('chart-load').getByRole('img');
	await expect(page.getByTestId('chart-load-value-l1')).toHaveText(/\d/, { timeout: 20_000 });
	await svg.focus();
	await page.keyboard.press('ArrowLeft');
	await expect(page.getByTestId('chart-load-tooltip')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('chart-load-tooltip')).toHaveCount(0);
});

test('streams pause while the tab is hidden', async ({ page }) => {
	await login(page, 'status/realtime');
	await expectTransport(page);
	const hide = (state: 'hidden' | 'visible') =>
		page.evaluate((s) => {
			Object.defineProperty(document, 'visibilityState', {
				configurable: true,
				get: () => s,
			});
			document.dispatchEvent(new Event('visibilitychange'));
		}, state);

	await hide('hidden');
	await expect(page.locator('html')).toHaveAttribute('data-transport', 'idle');
	let requests = 0;
	page.on('request', (r) => {
		if (/\/ubus|\/nuci\/events/.test(r.url())) requests++;
	});
	await page.waitForTimeout(6000);
	expect(requests).toBe(0);

	await hide('visible');
	await expectTransport(page);
	await expect.poll(() => requests, { timeout: 15_000 }).toBeGreaterThan(0);
});
