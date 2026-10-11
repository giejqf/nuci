// SPDX-License-Identifier: Apache-2.0
// Phase 0: the router serves NuCI, /ubus answers, / redirects (D16).

import { expect, test } from '@playwright/test';
import { NULL_SID, ubus } from '../lib/router';

test('/nuci/ serves the SPA', async ({ page }) => {
	await page.goto('/nuci/');
	await expect(page).toHaveTitle('NuCI');
	await expect(page.getByTestId('tagline')).toHaveText('A modern web interface for OpenWrt');
});

test('/ redirects to /nuci/ when LuCI is absent', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/nuci\/$/);
});

test('/ubus answers system.board for the null session', async ({ request }) => {
	const reply = await ubus<{ release: { distribution: string; version: string } }>(
		request,
		NULL_SID,
		'system',
		'board',
	);
	expect(reply.result?.[0]).toBe(0);
	expect(reply.result?.[1]?.release.distribution).toBe('OpenWrt');
	expect(reply.result?.[1]?.release.version).toMatch(/^25\.12\./);
});

test('/ubus refuses privileged calls for the null session', async ({ request }) => {
	const reply = await ubus(request, NULL_SID, 'system', 'info');
	expect(reply.error?.code ?? reply.result?.[0]).not.toBe(0);
});
