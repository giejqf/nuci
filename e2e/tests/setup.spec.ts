// SPDX-License-Identifier: Apache-2.0
// Phase 14: the first-run setup wizard on a router whose root password was
// removed (what a fresh image looks like to rpcd).

import { expect, test, type Page } from '@playwright/test';
import { createRpc } from '../../packages/rpc/src/index.ts';
import { rootPassword } from '../lib/router';
import { slow } from '../lib/timing';

const base = `http://127.0.0.1:${process.env.NUCI_HTTP_PORT ?? '8080'}`;
const CONFIGS = ['network', 'wireless', 'system'];
const SAVED = (c: string) => `/tmp/nuci-e2e-setup.${c}`;

async function api() {
	const rpc = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await rpc.session.login('root', rootPassword());
	return rpc;
}

async function next(page: Page, step: string) {
	await page.getByTestId('setup-next').click();
	await expect(page.locator('[aria-current="step"]')).toHaveText(step);
}

test('first-run wizard: password, internet, Wi-Fi and time zone, applied with rollback', async ({
	page,
}) => {
	test.setTimeout(slow(600_000));
	const rpc = await api();
	for (const c of CONFIGS) await rpc.file.exec('/bin/cp', [`/etc/config/${c}`, SAVED(c)]);
	await rpc.file.exec('/bin/passwd', ['-d', 'root']);
	try {
		// Without a root password rpcd accepts any password; the wizard opens by itself.
		await page.goto('/nuci/#/status/overview');
		await page.getByLabel('Password').fill('anything');
		await page.getByRole('button', { name: 'Log in' }).click();
		await expect(page).toHaveURL(/#\/system\/setup$/);
		await expect(page.getByText('This router has no password yet')).toBeVisible();
		await expect(page.getByTestId('apply-bar')).toHaveCount(0);
		await expect(page.getByTestId('setup-next')).toBeDisabled();

		await page.getByTestId('setup-pw1').fill(rootPassword());
		await page.getByTestId('setup-pw2').fill(rootPassword());
		await page.getByTestId('setup-set-password').click();
		await expect(page.getByTestId('setup-password-ok')).toContainText('Password set');
		expect((await (await api()).nuci.system.setupStatus()).root_password).toBe(true);

		// Internet: the lab's WAN address as a static configuration (keeps it online).
		await next(page, 'Internet');
		await expect(page.getByTestId('setup-wan-proto')).toHaveValue('dhcp');
		await page.getByTestId('setup-wan-proto').selectOption('static');
		const addrs = page.getByTestId('field-ipaddr');
		await addrs.getByLabel('New entry for IPv4 addresses').fill('10.0.2.15/24');
		await addrs.getByRole('button', { name: 'Add entry' }).click();
		await page.getByTestId('field-gateway').fill('10.0.2.2');
		const dns = page.getByTestId('field-dns');
		await dns.getByLabel('New entry for DNS servers').fill('10.0.2.3');
		await dns.getByRole('button', { name: 'Add entry' }).click();

		// Wi-Fi: enabling a network picks WPA2/WPA3 and asks for a key.
		await next(page, 'Wi-Fi');
		await page.getByTestId('setup-wifi-enable-radio0').check();
		await expect(page.getByTestId('setup-wifi-encryption-radio0')).toHaveValue('sae-mixed');
		await page.getByTestId('setup-wifi-ssid-radio0').fill('nuci-setup');
		await page.getByTestId('setup-wifi-key-radio0').fill('short');
		await expect(page.getByTestId('setup-next')).toBeDisabled();
		await page.getByTestId('setup-wifi-key-radio0').fill('setup-e2e-key');
		await expect(page.getByTestId('setup-wifi-country-radio0')).toHaveValue('US');

		await next(page, 'Time zone');
		await page.getByTestId('setup-zonename').selectOption('Europe/Berlin');

		await next(page, 'Review');
		await expect(page.getByText('wireless.default_radio0.ssid')).toBeVisible();
		await page.getByTestId('setup-apply').click();
		await expect(page.getByTestId('setup-apply-status')).toContainText('roll back in', {
			timeout: slow(60_000),
		});
		await expect(page.getByTestId('setup-done')).toBeVisible({ timeout: slow(180_000) });

		const after = await api();
		expect(await after.uci.getSection('network', 'wan')).toMatchObject({
			proto: 'static',
			ipaddr: ['10.0.2.15/24'],
			gateway: '10.0.2.2',
		});
		expect(await after.uci.getSection('wireless', 'default_radio0')).toMatchObject({
			ssid: 'nuci-setup',
			encryption: 'sae-mixed',
			key: 'setup-e2e-key',
		});
		const system = Object.values(await after.uci.getAll('system')).find(
			(s) => s['.type'] === 'system',
		);
		expect(system?.zonename).toBe('Europe/Berlin');

		// With a password set, the next login lands on the overview.
		await page.evaluate(() => sessionStorage.clear());
		await page.goto('/nuci/#/status/overview');
		await page.reload();
		await page.getByLabel('Password').fill(rootPassword());
		await page.getByRole('button', { name: 'Log in' }).click();
		await expect(page.getByTestId('sidebar')).toBeVisible();
		await expect(page).toHaveURL(/#\/status\/overview$/);
	} finally {
		const r = createRpc({ endpoint: `${base}/ubus`, storage: null });
		// Whatever state the router is in: any password works while it has none.
		await r.session.login('root', rootPassword());
		await r.rpcSys.passwordSet('root', rootPassword());
		for (const c of CONFIGS) await r.file.exec('/bin/cp', [SAVED(c), `/etc/config/${c}`]);
		// reload_config would compare against boot-time checksums and skip them.
		await r.file.exec('/etc/init.d/network', ['reload']);
		await r.file.exec('/etc/init.d/system', ['reload']);
	}
});
