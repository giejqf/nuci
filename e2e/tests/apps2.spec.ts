// SPDX-License-Identifier: Apache-2.0
// Phase 17: nuci-app-nlbwmon and nuci-app-adblock on the lab router (exit
// criteria in AGENTS.md). Neither test needs the internet.

import { get as httpGet } from 'node:http';
import { expect, test, type Page } from '@playwright/test';
import { createRpc } from '../../packages/rpc/src/index.ts';
import { lookup as dnsLookup } from '../lib/dns';
import { rootPassword } from '../lib/router';
import { slow } from '../lib/timing';
import { login } from '../lib/ui';

const base = `http://127.0.0.1:${process.env.NUCI_HTTP_PORT ?? '8080'}`;
// Answered by dnsmasq itself (an address= rule), so no upstream DNS is needed;
// adblock's entry for the subdomain is more specific and wins while it is listed.
const ZONE = 'nuci-e2e.test';
const BLOCKED = `ads.${ZONE}`;
const ADDRESS = `/${ZONE}/192.0.2.7`;

async function api() {
	const rpc = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await rpc.session.login('root', rootPassword());
	return rpc;
}

async function applyWithRollback(page: Page) {
	await page.getByTestId('apply-apply').click();
	await expect(page.getByTestId('apply-status')).toContainText('roll back in', {
		timeout: slow(30_000),
	});
	await expect(page.getByText('Configuration applied.')).toBeVisible({ timeout: slow(120_000) });
}

const asList = (v: unknown): string[] =>
	Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : [];

test.describe.configure({ mode: 'serial' });

test('nlbwmon: a transfer from the lab client shows up per client and protocol', async ({
	page,
}) => {
	test.setTimeout(slow(300_000));
	const rpc = await api();
	const [name, before] = Object.entries(await rpc.uci.getAll('nlbwmon')).find(
		([, s]) => s['.type'] === 'nlbwmon',
	)!;
	const networks = asList(before.local_network);

	try {
		await login(page, 'status/traffic');
		await expect(page.getByTestId('nlbw-state')).toHaveText('counting', {
			timeout: slow(30_000),
		});
		// nlbwmon skips traffic between two local addresses, and the lab client
		// (QEMU's 192.168.1.2) only talks to the router: count just the client.
		const list = page.getByTestId('nlbw-networks');
		for (const n of networks) await list.getByRole('button', { name: `Remove ${n}` }).click();
		await list.getByLabel('New entry for Local networks').fill('192.168.1.2/32');
		await list.getByRole('button', { name: 'Add entry' }).click();
		await page.getByLabel('Refresh interval').fill('5s');
		await applyWithRollback(page);

		// The transfer: the adblock app's bundle (~120 KB), eight times over HTTP.
		await expect
			.poll(
				async () => {
					for (let i = 0; i < 8; i++) await get(`${base}/nuci/apps/adblock/index.js`);
					const d = await rpc.client.call<{
						clients: { ips: string[]; rx_bytes: number }[];
					}>('nuci.nlbwmon', 'data', {});
					return d.clients.find((c) => c.ips.includes('192.168.1.2'))?.rx_bytes ?? 0;
				},
				{ timeout: slow(120_000), intervals: [5_000] },
			)
			.toBeGreaterThan(500_000);

		const row = page.getByTestId('nlbw-clients').getByRole('row', { name: /192\.168\.1\.2/ });
		await expect(row).toBeVisible({ timeout: slow(30_000) });
		await row.getByTestId('nlbw-client').click();
		await expect(page.getByTestId('nlbw-client-detail')).toContainText('HTTP');
		await page.getByRole('tab', { name: 'By protocol' }).click();
		await expect(
			page.getByTestId('nlbw-protocols').getByRole('row', { name: /HTTP/ }).first(),
		).toBeVisible();
	} finally {
		await rpc.uci.set('nlbwmon', name, {
			local_network: networks,
			refresh_interval: String(before.refresh_interval ?? '30s'),
		});
		await rpc.uci.apply(false);
	}
});

/** nslookup on the router (nuci.diag, answered by dnsmasq); the finished job's output. */
const lookup = async (host: string) => dnsLookup(await api(), host);

/** Download a file over a new connection each time (no keep-alive reuse). */
function get(url: string): Promise<number> {
	return new Promise((resolve, reject) => {
		httpGet(url, { agent: false }, (res) => {
			let n = 0;
			res.on('data', (c: Buffer) => (n += c.length));
			res.on('end', () => resolve(n));
			res.on('error', reject);
		}).on('error', reject);
	});
}

test('adblock: a domain from the own blocklist is blocked, the allowlist lets it through', async ({
	page,
}) => {
	test.setTimeout(slow(420_000));
	const rpc = await api();
	const before = (await rpc.uci.getAll('adblock')).global!;
	const [dnsmasq, dns] = Object.entries(await rpc.uci.getAll('dhcp')).find(
		([, s]) => s['.type'] === 'dnsmasq',
	)!;
	const addresses = asList(dns.address);
	await rpc.uci.set('dhcp', dnsmasq, { address: [...addresses, ADDRESS] });
	await rpc.uci.apply(false);

	try {
		await login(page, 'services/adblock');
		// Only the local list: no feed downloads from the internet.
		const feeds = page.getByTestId('adblock-feeds');
		await expect(feeds).toBeVisible();
		const checked = feeds.getByRole('checkbox', { checked: true });
		while ((await checked.count()) > 0) await checked.first().uncheck();
		await page.getByTestId('adblock-list-block').fill(BLOCKED);
		await page.getByTestId('adblock-save-block').click();
		await expect(page.getByTestId('adblock-save-block')).toBeDisabled();
		await page.getByTestId('adblock-enabled').check();
		await applyWithRollback(page);
		await expect(page.getByTestId('adblock-state')).toHaveText('active', {
			timeout: slow(120_000),
		});
		await expect(page.getByTestId('adblock-blocked')).toHaveText('1');

		await page.getByTestId('adblock-lookup').fill(BLOCKED);
		await page.getByTestId('adblock-lookup-go').click();
		await expect(page.getByTestId('adblock-lookup-result')).toContainText('adblock.blocklist', {
			timeout: slow(60_000),
		});

		await expect.poll(() => lookup(BLOCKED), { timeout: slow(90_000) }).toContain('NXDOMAIN');
		// The rest of the zone still resolves.
		expect(await lookup(`www.${ZONE}`)).toContain('192.0.2.7');

		await page.getByTestId('adblock-list-allow').fill(BLOCKED);
		await page.getByTestId('adblock-save-allow').click();
		await expect(page.getByTestId('adblock-save-allow')).toBeDisabled();
		await expect.poll(() => lookup(BLOCKED), { timeout: slow(120_000) }).toContain('192.0.2.7');
	} finally {
		for (const list of ['allow', 'block'])
			await rpc.client.call('nuci.adblock', 'set_list', { list, domains: [] });
		const feeds = asList(before.adb_feed);
		await rpc.uci.set('adblock', 'global', {
			adb_enabled: String(before.adb_enabled ?? '0'),
			...(feeds.length ? { adb_feed: feeds } : {}),
		});
		if (!feeds.length) await rpc.uci.delete('adblock', 'global', ['adb_feed']);
		if (addresses.length) await rpc.uci.set('dhcp', dnsmasq, { address: addresses });
		else await rpc.uci.delete('dhcp', dnsmasq, ['address']);
		await rpc.uci.apply(false);
	}
});
