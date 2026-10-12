// SPDX-License-Identifier: Apache-2.0
// Phase 4: the Network group. Exit criteria: full Network e2e; interface
// changes go through the rollback protocol; wireless scan (mac80211_hwsim).

import { expect, test, type Page } from '@playwright/test';
import { createRpc } from '../../packages/rpc/src/index.ts';
import { rootPassword } from '../lib/router';
import { login } from '../lib/ui';

const base = `http://127.0.0.1:${process.env.NUCI_HTTP_PORT ?? '8080'}`;

async function api() {
	const rpc = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await rpc.session.login('root', rootPassword());
	return rpc;
}

/** Save & Apply and wait for the confirm; asserts the rollback countdown ran. */
async function applyWithRollback(page: Page) {
	await page.getByTestId('apply-apply').click();
	await expect(page.getByTestId('apply-status')).toContainText('roll back in', {
		timeout: 30_000,
	});
	await expect(page.getByText('Configuration applied.')).toBeVisible({ timeout: 120_000 });
}

test.describe.configure({ mode: 'serial' });

test('interfaces: list, and an address change applies with rollback protection', async ({
	page,
}) => {
	test.setTimeout(300_000);
	await login(page, 'network/interfaces');
	await expect(page.getByTestId('iface-lan-addrs')).toContainText('192.168.1.1/24');
	await expect(page.getByTestId('iface-wan')).toBeVisible();

	await page.getByTestId('iface-lan-edit').click();
	await expect(page).toHaveURL(/#\/network\/interfaces\/lan$/);
	const list = page.getByTestId('field-ipaddr');
	await list.getByLabel('New entry for IPv4 addresses').fill('192.168.1.250/33');
	await expect(list.getByRole('alert')).toBeVisible();
	await list.getByLabel('New entry for IPv4 addresses').fill('192.168.1.250/24');
	await list.getByRole('button', { name: 'Add entry' }).click();
	await applyWithRollback(page);

	const rpc = await api();
	await expect
		.poll(
			async () =>
				((await rpc.network.interface('lan'))['ipv4-address'] ?? []).map((a) => a.address),
			{ timeout: 30_000 },
		)
		.toContain('192.168.1.250');

	await list.getByRole('button', { name: 'Remove 192.168.1.250/24' }).click();
	await applyWithRollback(page);
	await expect
		.poll(
			async () =>
				((await rpc.network.interface('lan'))['ipv4-address'] ?? []).map((a) => a.address),
			{ timeout: 30_000 },
		)
		.not.toContain('192.168.1.250');
});

test('interfaces: protocol forms are table-driven and switching drops old options', async ({
	page,
}) => {
	await login(page, 'network/interfaces/wan');
	await expect(page.getByTestId('field-proto')).toHaveValue('dhcp');
	await expect(page.getByTestId('field-hostname')).toBeVisible();
	await page.getByTestId('field-proto').selectOption('pppoe');
	await expect(page.getByTestId('field-username')).toBeVisible();
	await expect(page.getByTestId('field-hostname')).toHaveCount(0);
	await page.getByRole('tab', { name: 'Firewall' }).click();
	await expect(page.getByTestId('field-zone')).toHaveValue('wan');
	await page.getByTestId('apply-revert').click();
	await expect(page.getByTestId('apply-bar')).toHaveCount(0);
});

test('interfaces: create and delete an interface in a firewall zone', async ({ page }) => {
	test.setTimeout(300_000);
	await login(page, 'network/interfaces');
	await page.getByTestId('iface-add').click();
	await page.getByTestId('new-iface-name').fill('lan');
	await expect(page.getByText('An interface with this name exists.')).toBeVisible();
	await page.getByTestId('new-iface-name').fill('e2etest');
	await page.getByTestId('iface-add-modal').getByLabel('Firewall zone').selectOption('lan');
	await page.getByTestId('new-iface-create').click();
	await expect(page).toHaveURL(/#\/network\/interfaces\/e2etest$/);
	await page
		.getByTestId('field-ipaddr')
		.getByLabel('New entry for IPv4 addresses')
		.fill('10.99.0.1/24');
	await page.getByTestId('field-ipaddr').getByRole('button', { name: 'Add entry' }).click();
	await applyWithRollback(page);

	const rpc = await api();
	expect((await rpc.uci.getSection('network', 'e2etest')).ipaddr).toEqual(['10.99.0.1/24']);
	const zones = Object.values(await rpc.uci.getAll('firewall')).filter(
		(s) => s['.type'] === 'zone',
	);
	expect(zones.find((z) => z.name === 'lan')?.network).toEqual(
		expect.arrayContaining(['lan', 'e2etest']),
	);

	await page.goto('/nuci/#/network/interfaces');
	await page.getByTestId('iface-e2etest').getByRole('button', { name: 'Delete e2etest' }).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await applyWithRollback(page);
	await expect
		.poll(async () => Object.keys(await rpc.uci.getAll('network')))
		.not.toContain('e2etest');
});

test('devices: status lists physical devices and the LAN bridge', async ({ page }) => {
	await login(page, 'network/devices');
	const table = page.getByTestId('device-status');
	for (const dev of ['eth0', 'eth1', 'br-lan'])
		await expect(table.getByRole('row', { name: new RegExp(`\\b${dev}\\b`) })).toBeVisible();
	await expect(page.getByTestId('devices').getByRole('row', { name: /br-lan/ })).toContainText(
		'eth0',
	);
});

test('dhcp & dns + hostnames + diagnostics: a hostname resolves through dnsmasq', async ({
	page,
}) => {
	test.setTimeout(300_000);
	await login(page, 'network/dhcp');
	await page.getByRole('tab', { name: 'Static leases' }).click();
	await page.getByTestId('static-leases-add').click();
	await page.getByTestId('lease-name').fill('e2e-printer');
	await page
		.getByTestId('lease-mac')
		.getByLabel('New entry for MAC address')
		.fill('02:00:00:aa:bb:cc');
	await page.getByTestId('lease-mac').getByRole('button', { name: 'Add entry' }).click();
	await page.getByTestId('lease-ip').fill('192.168.1.77');
	await page.getByTestId('static-leases-done').click();
	await expect(page.getByTestId('static-leases')).toContainText('e2e-printer');

	await page.goto('/nuci/#/network/hostnames');
	await page.getByTestId('hostnames-add').click();
	await page.getByTestId('hostname-name').fill('e2e-nas');
	await page.getByTestId('hostname-ip').fill('192.168.1.88');
	await page.getByTestId('hostnames-done').click();
	await applyWithRollback(page);

	await page.goto('/nuci/#/network/diagnostics');
	await page.getByTestId('diag-tool').selectOption('nslookup');
	await page.getByTestId('diag-host').fill('e2e-nas');
	await page.getByTestId('diag-run').click();
	await expect(page.getByTestId('diag-output')).toContainText('192.168.1.88', {
		timeout: 60_000,
	});

	// cleanup through the API (staged + apply, like the UI)
	const rpc = await api();
	for (const [name, s] of Object.entries(await rpc.uci.getAll('dhcp')))
		if (s.name === 'e2e-nas' || s.name === 'e2e-printer') await rpc.uci.delete('dhcp', name);
	await rpc.uci.apply(false);
});

test('routes: a static route is installed on the interface', async ({ page }) => {
	test.setTimeout(240_000);
	await login(page, 'network/routes');
	await page.getByTestId('routes4-add').click();
	await page.getByTestId('route-target').fill('10.200.0.0/16');
	await page.getByTestId('route-gateway').fill('192.168.1.2');
	await page.getByTestId('routes4-done').click();
	await applyWithRollback(page);
	const rpc = await api();
	await expect
		.poll(
			async () =>
				((await rpc.network.interface('lan')).route ?? []).map(
					(r) => `${r.target}/${r.mask}`,
				),
			{ timeout: 30_000 },
		)
		.toContain('10.200.0.0/16');
	await page.getByTestId('routes4').getByRole('button', { name: 'Delete 10.200.0.0/16' }).click();
	await applyWithRollback(page);
});

test('diagnostics: ping the router itself', async ({ page }) => {
	await login(page, 'network/diagnostics');
	await page.getByTestId('diag-host').fill('127.0.0.1');
	await page.getByTestId('diag-run').click();
	await expect(page.getByTestId('diag-output')).toContainText('4 packets transmitted', {
		timeout: 60_000,
	});
	await page.getByTestId('diag-host').fill('-f');
	await expect(page.getByTestId('diag-run')).toBeDisabled();
});

/** Remove the test's wireless networks and the wwan interface (no rollback needed). */
async function cleanupWireless() {
	const rpc = await api();
	let changed = false;
	for (const [name, s] of Object.entries(await rpc.uci.getAll('wireless')))
		if (s['.type'] === 'wifi-iface' && s.ssid === 'nuci-e2e') {
			await rpc.uci.delete('wireless', name);
			changed = true;
		}
	if (Object.keys(await rpc.uci.getAll('network')).includes('wwan')) {
		await rpc.uci.delete('network', 'wwan');
		changed = true;
	}
	for (const [name, s] of Object.entries(await rpc.uci.getAll('firewall'))) {
		const nets = Array.isArray(s.network)
			? s.network
			: typeof s.network === 'string'
				? s.network.split(' ')
				: [];
		if (s['.type'] === 'zone' && nets.includes('wwan')) {
			await rpc.uci.set('firewall', name, { network: nets.filter((n) => n !== 'wwan') });
			changed = true;
		}
	}
	if (changed) await rpc.uci.apply(false);
}

async function leftovers(): Promise<number> {
	const rpc = await api();
	// No catch: a network reload can briefly fail requests, and "error" must not read as "clean".
	const w = Object.values(await rpc.uci.getAll('wireless')).filter((s) => s.ssid === 'nuci-e2e');
	const live = (await rpc.network.interfaces()).some((i) => i.interface === 'wwan');
	return (
		w.length +
		(Object.keys(await rpc.uci.getAll('network')).includes('wwan') ? 1 : 0) +
		(live ? 1 : 0)
	);
}

/** Retry until clean: requests can fail while the cleanup's own reload runs. */
async function ensureClean() {
	await expect
		.poll(
			async () => {
				await cleanupWireless();
				return leftovers();
			},
			{ timeout: 120_000, intervals: [2000, 5000, 10_000] },
		)
		.toBe(0);
}

test('wireless: AP on radio0, scan from radio1, join, station associates', async ({ page }) => {
	test.setTimeout(420_000);
	const rpc = await api();
	const radios = Object.values(await rpc.uci.getAll('wireless').catch(() => ({}))).filter(
		(s) => s['.type'] === 'wifi-device',
	);
	test.skip(radios.length < 2, 'needs two mac80211_hwsim radios (provision.sh --wireless)');
	await ensureClean(); // a failed earlier run may have left networks behind

	try {
		await login(page, 'network/wireless');
		// Isolated WPA2 AP on radio0
		await page.getByTestId('radio-radio0-add').click();
		const ed = page.getByTestId('iface-editor');
		await ed.getByTestId('wifi-ssid').fill('nuci-e2e');
		await ed.getByTestId('wifi-network').selectOption('');
		await ed.getByTestId('wifi-encryption').selectOption('psk2');
		await ed.getByTestId('wifi-key').fill('nuci-e2e-key');
		await page.getByTestId('iface-editor-done').click();
		await applyWithRollback(page);
		await expect(
			page.getByTestId('radio-radio0-ifaces').getByRole('row', { name: /nuci-e2e/ }),
		).toContainText('phy0', { timeout: 60_000 });

		// Scan from the other radio and join
		await page.getByTestId('radio-radio1-scan').click();
		const results = page.getByTestId('scan-results');
		await expect(results.getByRole('row', { name: /nuci-e2e/ })).toContainText('WPA2-PSK', {
			timeout: 60_000,
		});
		await results.getByRole('button', { name: 'Join nuci-e2e' }).click();
		await page.getByTestId('join-key').fill('nuci-e2e-key');
		await page.getByTestId('join-submit').click();
		await applyWithRollback(page);

		// Each side lists the other: the AP its station, the station its AP.
		await expect(
			page.getByTestId('stations').getByRole('row', { name: /nuci-e2e/ }),
		).toHaveCount(2, {
			timeout: 90_000,
		});
	} finally {
		await ensureClean();
	}
});
