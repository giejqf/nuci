// SPDX-License-Identifier: Apache-2.0
// Phase 1: login, ACL-aware shell, live Overview, extension path, logout.

import { expect, test } from '@playwright/test';
import { createRpc } from '../../packages/rpc/src/index.ts';
import { rootPassword } from '../lib/router';
import { login } from '../lib/ui';
import { slow } from '../lib/timing';

const base = `http://127.0.0.1:${process.env.NUCI_HTTP_PORT ?? '8080'}`;

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
	const row = (name: string) =>
		interfaces.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });
	await expect(row('lan')).toContainText('192.168.1.1/24');
	await expect(row('wan')).toContainText('dhcp');

	// stats stream: CPU usage needs two samples, uptime keeps moving
	await expect(page.getByTestId('overview-cpu')).toContainText('%', { timeout: slow(20_000) });
	const uptime = await page.getByTestId('overview-uptime').textContent();
	await expect(page.getByTestId('overview-uptime')).not.toHaveText(uptime ?? '', {
		timeout: slow(20_000),
	});
	await expect(page.getByTestId('overview-memory')).toContainText('MiB');
	// The lab's radios exist with their networks disabled (Phase 15: listed, not "no devices").
	await expect(page.getByTestId('overview-wireless')).toContainText('radio0');
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
	await expect(page.getByTestId('hello-sdk')).toHaveText('sdk 0.3.0');
});

test('a nuci-app edits uci through the host: change review and apply with rollback', async ({
	page,
}) => {
	test.setTimeout(slow(180_000));
	await login(page, 'services/hello');
	const field = page.getByTestId('hello-description');
	await expect(field).toBeEditable();
	const value = `e2e app ${Date.now()}`;
	await field.fill(value);
	// Staged in the host model: the host's apply bar counts it and lists it.
	await expect(page.getByTestId('apply-review')).toContainText('1 unsaved');
	await page.getByTestId('apply-review').click();
	await expect(page.getByTestId('change-list')).toContainText(`.description = '${value}'`);
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('apply-review-modal')).toBeHidden();
	await page.getByTestId('apply-apply').click();
	await expect(page.getByTestId('apply-status')).toContainText('roll back in', {
		timeout: slow(30_000),
	});
	await expect(page.getByText('Configuration applied.')).toBeVisible({ timeout: slow(120_000) });

	const rpc = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await rpc.session.login('root', rootPassword());
	const sys = Object.values(await rpc.uci.getAll('system')).find((s) => s['.type'] === 'system');
	expect(sys?.description).toBe(value);

	// Clean up through the app as well.
	await field.fill('');
	await page.getByTestId('apply-apply').click();
	await expect(page.getByText('Configuration applied.')).toBeVisible({ timeout: slow(120_000) });
});
