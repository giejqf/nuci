// SPDX-License-Identifier: Apache-2.0
// Phase 15: fixes for problems found while capturing the design-request
// screenshots (docs/design/DesignRequest.md).

import { expect, test } from '@playwright/test';
import { createRpc } from '../../packages/rpc/src/index.ts';
import { rootPassword } from '../lib/router';
import { login } from '../lib/ui';
import { slow } from '../lib/timing';

const base = `http://127.0.0.1:${process.env.NUCI_HTTP_PORT ?? '8080'}`;

async function api() {
	const rpc = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await rpc.session.login('root', rootPassword());
	return rpc;
}

test('overview lists radios whose networks are all disabled', async ({ page }) => {
	const radios = await (await api()).network.wireless();
	test.skip(!Object.keys(radios).length, 'the lab has no radios');
	const idle = Object.entries(radios)
		.filter(([, r]) => !r.interfaces?.length)
		.map(([name]) => name);

	await login(page);
	const card = page.getByTestId('overview-wireless');
	await expect(card).not.toContainText('No wireless devices');
	for (const radio of idle)
		await expect(
			card.getByTestId('overview-radio-idle').filter({ hasText: radio }),
		).toBeVisible();
});

test('on a phone, table row actions stay on screen (wireless, port forwards)', async ({ page }) => {
	await login(page, 'network/wireless'); // desktop layout: login() waits for the sidebar
	await page.setViewportSize({ width: 390, height: 844 });
	const inView = async (name: RegExp) => {
		const box = await page.getByRole('button', { name }).first().boundingBox();
		expect(box).not.toBeNull();
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(390);
	};

	await expect(page.getByTestId('radio-radio0-ifaces')).toBeVisible();
	await inView(/^Edit /);

	await page.goto('/nuci/#/firewall/forwards');
	await page.getByTestId('forwards-add').click();
	await page.getByTestId('fwd-name').fill('e2e-mobile');
	await page.getByTestId('fwd-src-dport').fill('8023');
	await page.getByTestId('fwd-dest-ip').fill('192.168.1.51');
	await page.getByTestId('forwards-done').click();
	await inView(/^Delete e2e-mobile$/);
	await page.getByRole('button', { name: 'Delete e2e-mobile' }).click();
	await expect(page.getByTestId('apply-bar')).toHaveCount(0);
});

test('an add dialog stages nothing until Done, and Done says what is missing', async ({ page }) => {
	await login(page, 'firewall/forwards');
	await page.getByTestId('forwards-add').click();
	const dialog = page.getByTestId('forwards-editor');
	await expect(dialog).toBeVisible();
	await expect(page.getByTestId('apply-bar')).toHaveCount(0);

	// Done on an empty form: errors appear, the dialog stays open.
	await page.getByTestId('forwards-done').click();
	await expect(dialog.getByRole('alert').first()).toBeVisible();
	await expect(dialog).toBeVisible();
	await expect(page.getByTestId('apply-bar')).toHaveCount(0);

	// Cancel leaves nothing behind.
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByTestId('apply-bar')).toHaveCount(0);

	// Leaving the page with the dialog open does not leave a draft either.
	await page.getByTestId('forwards-add').click();
	await page.getByTestId('fwd-name').fill('e2e-abandoned');
	await page.goto('/nuci/#/firewall/rules');
	await expect(page.getByTestId('apply-bar')).toHaveCount(0);
	await page.goto('/nuci/#/firewall/forwards');
	await expect(page.getByTestId('forwards')).not.toContainText('e2e-abandoned');
});

test('software: without package lists the page says so and search downloads them', async ({
	page,
}) => {
	test.setTimeout(slow(300_000));
	// What a router looks like after a reboot: /var/cache/apk is tmpfs.
	await (await api()).file.exec('/bin/rm', ['-rf', '/var/cache/apk']);

	await login(page, 'system/software');
	await expect(page.getByTestId('pkg-lists-missing')).toBeVisible();
	await page.getByRole('tab', { name: 'Available' }).click();
	await page.getByTestId('pkg-search').fill('tree');
	await page.getByRole('button', { name: 'Search' }).click();
	await expect(page.getByTestId('pkg-results').getByRole('row', { name: /^tree\b/ })).toBeVisible(
		{ timeout: slow(180_000) },
	);
	await expect(page.getByTestId('pkg-lists-missing')).toHaveCount(0);
	expect((await (await api()).nuci.pkg.lists()).count).toBeGreaterThan(0);
});
