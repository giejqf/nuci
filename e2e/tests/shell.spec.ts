// SPDX-License-Identifier: Apache-2.0
// Phase 1: login, ACL-aware shell, live Overview, extension path, logout.

import { expect, test } from '@playwright/test';
import { login } from '../lib/ui';

test('wrong password shows an error', async ({ page }) => {
	await page.goto('/nuci/');
	await page.getByLabel('Password').fill('definitely-wrong');
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByTestId('login-error')).toHaveText('Wrong username or password.');
});

test('overview shows live data from the router', async ({ page }) => {
	await login(page);
	await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
	await expect(page.getByTestId('overview-hostname')).not.toHaveText('—');
	await expect(page.getByTestId('overview-model')).toContainText('QEMU');
	await expect(page.getByTestId('overview-firmware')).toContainText('OpenWrt 25.12');

	const interfaces = page.getByTestId('overview-interfaces');
	await expect(interfaces.getByRole('row', { name: /lan/ })).toContainText('192.168.1.1/24');
	await expect(interfaces.getByRole('row', { name: /wan\b/ })).toContainText('dhcp');

	// stats stream: CPU usage needs two samples, uptime keeps moving
	await expect(page.getByTestId('overview-cpu')).toContainText('%', { timeout: 20_000 });
	const uptime = await page.getByTestId('overview-uptime').textContent();
	await expect(page.getByTestId('overview-uptime')).not.toHaveText(uptime ?? '', {
		timeout: 20_000,
	});
	await expect(page.getByTestId('overview-memory')).toContainText('MiB');
	await expect(page.getByTestId('overview-wireless')).toContainText('No wireless devices.');
	await expect(page.getByTestId('overview-leases')).toBeVisible();
});

test('session survives a reload (sessionStorage) and logout ends it', async ({ page }) => {
	await login(page);
	await page.reload();
	await expect(page.getByTestId('sidebar')).toBeVisible();
	await page.getByTestId('logout').click();
	await expect(page.getByTestId('login-form')).toBeVisible();
	await page.reload();
	await expect(page.getByTestId('login-form')).toBeVisible();
});

test('sidebar lists the routes the session may read', async ({ page }) => {
	await login(page);
	const sidebar = page.getByTestId('sidebar');
	await expect(sidebar.getByRole('link', { name: 'Overview' })).toHaveAttribute(
		'aria-current',
		'page',
	);
	await page.goto('/nuci/#/does/not-exist');
	await expect(page.getByTestId('not-found')).toBeVisible();
});

test('an installed nuci-app registers a page through @nuci/app-sdk', async ({ page }) => {
	await login(page);
	const link = page.getByTestId('sidebar').getByRole('link', { name: 'Hello' });
	await expect(link).toBeVisible();
	await link.click();
	await expect(page).toHaveURL(/#\/services\/hello$/);
	await expect(page.getByTestId('hello-greeting')).toHaveText(/^Hello from \S+/);
	await expect(page.getByTestId('hello-sdk')).toHaveText('sdk 0.1.0');
});
