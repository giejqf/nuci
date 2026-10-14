// SPDX-License-Identifier: Apache-2.0
// Phases 20–22: the 0.5 apps on the lab router (exit criteria in AGENTS.md).
// None of the tests needs the internet.

import { expect, test, type Page } from '@playwright/test';
import { createRpc } from '../../packages/rpc/src/index.ts';
import { applyChanges } from '../../packages/uci/src/apply.ts';
import { UciModel } from '../../packages/uci/src/model.ts';
import { lookup } from '../lib/dns';
import { startDohStub } from '../lib/doh-stub';
import { rootPassword } from '../lib/router';
import { restoreConfig } from '../lib/uci';
import { slow } from '../lib/timing';
import { login } from '../lib/ui';

const base = `http://127.0.0.1:${process.env.NUCI_HTTP_PORT ?? '8080'}`;

async function api() {
	const rpc = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await rpc.session.login('root', rootPassword());
	return rpc;
}
type Rpc = Awaited<ReturnType<typeof api>>;

async function apply(page: Page) {
	await page.getByTestId('apply-apply').click();
	await expect(page.getByText('Configuration applied.')).toBeVisible({ timeout: slow(120_000) });
}

async function nft(rpc: Rpc, ...args: string[]) {
	const r = await rpc.file.exec('/usr/sbin/nft', args);
	if (r.code) throw new Error(`nft ${args.join(' ')}: ${r.stderr ?? r.code}`);
	return r.stdout ?? '';
}

/** Packets counted by the rules of a netdev table, by rule comment. */
async function counters(rpc: Rpc, table: string): Promise<Record<string, number>> {
	const doc = JSON.parse(await nft(rpc, '-j', 'list', 'table', 'netdev', table)) as {
		nftables: { rule?: { comment?: string; expr: { counter?: { packets: number } }[] } }[];
	};
	const out: Record<string, number> = {};
	for (const { rule } of doc.nftables)
		if (rule?.comment)
			out[rule.comment] = rule.expr.find((e) => e.counter)?.counter?.packets ?? 0;
	return out;
}

test.describe.configure({ mode: 'serial' });

test('wol: a magic packet for a saved device and for a typed MAC leaves the interface', async ({
	page,
}) => {
	test.setTimeout(slow(240_000));
	const rpc = await api();
	const TABLE = 'nuci_e2e_wol';
	const SAVED = '52:54:00:e2:e0:01';
	// Wake-on-LAN frames (EtherType 0x0842) leaving br-lan, counted in netdev egress:
	// etherwake's packet socket goes through the device queue, so the hook sees it.
	await nft(rpc, 'add', 'table', 'netdev', TABLE);
	await nft(
		rpc,
		'add',
		'chain',
		'netdev',
		TABLE,
		'out',
		'{ type filter hook egress device br-lan priority 0; }',
	);
	await nft(
		rpc,
		'add',
		'rule',
		'netdev',
		TABLE,
		'out',
		'ether',
		'daddr',
		SAVED,
		'ether',
		'type',
		'0x0842',
		'counter',
		'comment',
		'saved',
	);
	await nft(
		rpc,
		'add',
		'rule',
		'netdev',
		TABLE,
		'out',
		'ether',
		'daddr',
		'ff:ff:ff:ff:ff:ff',
		'ether',
		'type',
		'0x0842',
		'counter',
		'comment',
		'broadcast',
	);

	try {
		await login(page, 'services/wol');
		const targets = page.getByTestId('wol-targets');
		await page.getByTestId('wol-targets-add').click();
		await page.getByTestId('wol-target-name').fill('e2e-pc');
		await page.getByTestId('wol-target-mac').fill('aa:bb');
		await page.getByTestId('wol-targets-done').click();
		await expect(page.getByText('Enter a MAC address like aa:bb:cc:dd:ee:ff.')).toBeVisible();
		await page.getByTestId('wol-target-mac').fill(SAVED.toUpperCase());
		await page.getByTestId('wol-targets-done').click();
		await apply(page);

		const row = targets.locator('tr', { hasText: 'e2e-pc' });
		await row.getByTestId('wol-target-wake').click();
		await expect(page.getByText('Magic packet for e2e-pc sent on br-lan.')).toBeVisible();
		await expect.poll(async () => (await counters(rpc, TABLE)).saved).toBe(1);

		// A MAC typed by hand, to everyone.
		await page.getByTestId('wol-mac').fill('52-54-00-E2-E0-02');
		await page.getByLabel('Send to the broadcast address').first().check();
		await page.getByTestId('wol-wake').click();
		await expect(
			page.getByText('Magic packet for 52:54:00:e2:e0:02 sent on br-lan.'),
		).toBeVisible();
		await expect.poll(async () => (await counters(rpc, TABLE)).broadcast).toBe(1);

		// The router refuses what the form would not send.
		await expect(
			rpc.client.call('nuci.wol', 'wake', { mac: SAVED, interface: 'br-lan; reboot' }),
		).rejects.toThrow();
	} finally {
		await nft(rpc, 'delete', 'table', 'netdev', TABLE).catch(() => {});
		const all = await rpc.uci.getAll('etherwake');
		for (const [name, s] of Object.entries(all))
			if (s['.type'] === 'target' && s.name === 'e2e-pc')
				await rpc.uci.delete('etherwake', name);
		await rpc.uci.apply(false);
	}
});

test('https-dns-proxy: a resolver on a local DoH stub answers through dnsmasq; stopping restores dnsmasq', async ({
	page,
}) => {
	test.setTimeout(slow(300_000));
	const rpc = await api();
	// Not under .test, .lan, .local etc.: dnsmasq answers those itself and never forwards.
	const NAME = 'doh.nuci-e2e.example';
	// Not a private or TEST-NET address either: dnsmasq's rebind protection drops those.
	const ADDRESS = '198.18.0.53';
	const CA = '/tmp/nuci-e2e-ca.pem';
	const CONFIG = 'https-dns-proxy';
	const stub = await startDohStub({
		port: Number(process.env.NUCI_DOH_STUB_PORT ?? 18610),
		publicHost: '10.0.2.2', // the host, seen from the QEMU guest
		records: { [NAME]: ADDRESS },
	});
	const before = await rpc.uci.getAll(CONFIG);
	const dnsmasqServers = async () =>
		Object.values(await rpc.uci.getAll('dhcp'))
			.filter((s) => s['.type'] === 'dnsmasq')
			.flatMap((s) => (Array.isArray(s.server) ? s.server : s.server ? [s.server] : []));
	const serversBefore = await dnsmasqServers();
	// The proxy runs as nobody; rpcd's umask leaves new files private.
	await rpc.file.write(CA, stub.ca);
	await rpc.file.exec('/bin/chmod', ['644', CA]);

	try {
		await login(page, 'services/https-dns-proxy');
		const resolvers = page.getByTestId('doh-resolvers');
		// Only the stub: remove the package's default resolvers.
		const remove = resolvers.getByRole('button', { name: /^Delete / });
		await expect(remove.first()).toBeVisible();
		while ((await remove.count()) > 0) await remove.first().click();
		await page.getByTestId('doh-resolvers-add').click();
		await page.getByTestId('doh-provider').selectOption('custom');
		await page.getByTestId('doh-url').fill('http://insecure.example/dns-query');
		await page.getByTestId('doh-resolvers-done').click();
		await expect(page.getByText('Enter an https:// URL.')).toBeVisible();
		await page.getByTestId('doh-url').fill(stub.url);
		await page.getByTestId('doh-bootstrap').fill('');
		await page.getByTestId('doh-ca').fill(CA);
		await page.getByTestId('doh-resolvers-done').click();
		await expect(resolvers).toContainText(stub.url);
		await apply(page);

		if (await page.getByTestId('doh-start').isVisible())
			await page.getByTestId('doh-start').click();
		await expect(page.getByTestId('doh-running')).toHaveText('running', {
			timeout: slow(60_000),
		});
		await expect(page.getByTestId('doh-instances')).toContainText(stub.url);
		await expect(page.getByTestId('doh-dnsmasq')).toContainText('127.0.0.1#5053');

		await expect.poll(() => lookup(rpc, NAME), { timeout: slow(90_000) }).toContain(ADDRESS);
		expect(stub.queries).toContain(NAME);

		await page.getByTestId('doh-stop').click();
		await expect(page.getByTestId('doh-running')).toHaveText('stopped', {
			timeout: slow(60_000),
		});
		await expect(page.getByTestId('doh-dnsmasq')).toHaveText(
			'dnsmasq uses its own upstream servers.',
		);
		expect(await dnsmasqServers()).toEqual(serversBefore);
	} finally {
		await rpc.client
			.call('nuci.https-dns-proxy', 'service', { action: 'stop' })
			.catch(() => {});
		await expect
			.poll(
				async () =>
					(
						await rpc.client.call<{ job: { running: boolean } }>(
							'nuci.https-dns-proxy',
							'status',
						)
					).job.running,
			)
			.toBe(false);
		await restoreConfig(rpc, CONFIG, before);
		await rpc.uci.apply(false);
		await rpc.file.exec('/bin/rm', ['-f', CA]);
		await stub.close();
	}
});

test('frpc: a tcp proxy through an frps on the lab reaches the local web server', async ({
	page,
}) => {
	test.setTimeout(slow(300_000));
	const rpc = await api();
	const TOKEN = 'nuci-e2e-token';
	const frpsBefore = await rpc.uci.getAll('frps');
	const frpcBefore = await rpc.uci.getAll('frpc');
	// The server side, on the router itself.
	await rpc.uci.set('frps', 'common', { bind_port: '7000', token: TOKEN });
	await rpc.uci.apply(false);
	await rpc.file.exec('/etc/init.d/frps', ['restart']);

	try {
		await login(page, 'services/frpc');
		await page.getByTestId('frpc-server').fill('127.0.0.1');
		await page.getByTestId('frpc-server-port').fill('7000');
		await page.getByTestId('frpc-token').fill(TOKEN);
		await page.getByTestId('frpc-admin').check();

		const proxies = page.getByTestId('frpc-proxies');
		const remove = proxies.getByRole('button', { name: /^Delete / });
		while ((await remove.count()) > 0) await remove.first().click();
		await page.getByTestId('frpc-proxies-add').click();
		await page.getByTestId('frpc-proxy-name').fill('e2e web');
		await page.getByTestId('frpc-proxy-local-port').fill('80');
		await page.getByTestId('frpc-proxy-remote-port').fill('6080');
		await page.getByTestId('frpc-proxies-done').click();
		await expect(page.getByText("Use letters, digits, '.', '_' and '-' only.")).toBeVisible();
		await page.getByTestId('frpc-proxy-name').fill('e2e-web');
		await page.getByTestId('frpc-proxies-done').click();
		await apply(page);

		if (await page.getByTestId('frpc-start').isVisible())
			await page.getByTestId('frpc-start').click();
		await expect(page.getByTestId('frpc-running')).toHaveText('running', {
			timeout: slow(60_000),
		});
		const row = proxies.locator('tr', { hasText: 'e2e-web' });
		await expect(row).toContainText('running', { timeout: slow(60_000) });
		await expect(row).toContainText('127.0.0.1:80');

		// The server's port leads to the router's web server.
		const fetched = await rpc.file.exec('/bin/uclient-fetch', [
			'-q',
			'-O',
			'-',
			'http://127.0.0.1:6080/nuci/',
		]);
		expect(fetched.stdout).toContain('<title>NuCI</title>');
	} finally {
		await rpc.client.call('nuci.frpc', 'service', { action: 'stop' }).catch(() => {});
		await rpc.file.exec('/etc/init.d/frps', ['stop']).catch(() => {});
		await restoreConfig(rpc, 'frpc', frpcBefore);
		await restoreConfig(rpc, 'frps', frpsBefore);
		await rpc.uci.apply(false);
	}
});

// An 8×8 JPEG: minidlna indexes JPEG pictures (not PNG).
const JPEG =
	'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCnRRRXsnkn/9k=';

test('minidlna: a folder with a picture is indexed and counted; a rescan finds it again', async ({
	page,
}) => {
	test.setTimeout(slow(240_000));
	const rpc = await api();
	const DIR = '/tmp/nuci-e2e-media';
	const before = await rpc.uci.getAll('minidlna');
	// Readable for the minidlna user (rpcd's umask leaves new files private).
	await rpc.file.exec('/bin/mkdir', ['-p', '-m', '755', DIR]);
	await rpc.file.write(`${DIR}/e2e.jpg`, JPEG, { base64: true });
	await rpc.file.exec('/bin/chmod', ['644', `${DIR}/e2e.jpg`]);

	try {
		await login(page, 'services/minidlna');
		await page.getByTestId('dlna-enabled').check();
		await page.getByTestId('dlna-name').fill('NuCI e2e');
		const folders = page.getByTestId('dlna-folders');
		const remove = folders.getByRole('button', { name: /^Remove / });
		while ((await remove.count()) > 0) await remove.first().click();
		await page.getByTestId('dlna-folder-add').click();
		await folders.getByTestId('dlna-folder-kind').selectOption('P');
		await folders.getByTestId('dlna-folder-path').fill(DIR);
		await apply(page);

		await expect(page.getByTestId('dlna-running')).toHaveText('running', {
			timeout: slow(60_000),
		});
		const pictures = page.getByTestId('dlna-pictures');
		await expect(pictures).toContainText('1', { timeout: slow(60_000) });
		expect((await rpc.uci.getAll('minidlna')).config?.media_dir).toEqual([`P,${DIR}`]);

		await page.getByTestId('dlna-rescan').click();
		await expect(page.getByText('The media server reads all folders again.')).toBeVisible();
		await expect
			.poll(
				async () =>
					(
						await rpc.client.call<{ job: { running: boolean; rc?: number } }>(
							'nuci.minidlna',
							'status',
						)
					).job,
				{
					timeout: slow(60_000),
				},
			)
			.toMatchObject({ running: false, rc: 0 });
		await expect(pictures).toContainText('1', { timeout: slow(60_000) });
	} finally {
		await restoreConfig(rpc, 'minidlna', before);
		await rpc.uci.apply(false);
		await rpc.file.exec('/bin/rm', ['-rf', DIR]);
	}
});

/** The web app's probe (ADR-0002): is this connection's address and listener still planned? */
async function probe() {
	try {
		const res = await fetch(`${base}/nuci/probe`, { signal: AbortSignal.timeout(2000) });
		return res.ok && ((await res.json()) as { ok?: boolean }).ok === true;
	} catch {
		return false;
	}
}

test.describe('uhttpd', () => {
	let before: Awaited<ReturnType<Rpc['uci']['getAll']>>;
	test.beforeAll(async () => {
		before = await (await api()).uci.getAll('uhttpd');
	});
	test.afterAll(async () => {
		const rpc = await api();
		await restoreConfig(rpc, 'uhttpd', before);
		await rpc.uci.apply(false);
		await expect.poll(probe, { timeout: slow(60_000) }).toBe(true);
	});

	test('uhttpd: a new certificate replaces the old one', async ({ page }) => {
		test.setTimeout(slow(180_000));
		await login(page, 'system/uhttpd');
		const serial = page.getByTestId('uhttpd-serial');
		await expect(serial).not.toBeEmpty({ timeout: slow(30_000) });
		const old = await serial.innerText();
		await expect(page.getByTestId('uhttpd-subject')).toContainText('CN=');
		await page.getByTestId('uhttpd-regenerate').click();
		await page.getByTestId('uhttpd-regenerate-go').click();
		await expect(page.getByText('The new certificate is in use.')).toBeVisible({
			timeout: slow(120_000),
		});
		await expect(serial).not.toHaveText(old);
		await expect(page.getByTestId('uhttpd-valid')).toContainText(
			String(new Date().getFullYear()),
		);
	});

	test('uhttpd: a keep-alive and a listener change apply with rollback protection', async ({
		page,
	}) => {
		test.setTimeout(slow(180_000));
		await login(page, 'system/uhttpd');
		await page.getByTestId('uhttpd-keepalive').fill('25');
		const http = page.getByTestId('uhttpd-http');
		await http.getByLabel('New entry for HTTP').fill('0.0.0.0:80x');
		await expect(
			page.getByText('Enter a port, address:port or [IPv6 address]:port.'),
		).toBeVisible();
		await http.getByLabel('New entry for HTTP').fill('0.0.0.0:8088');
		await http.getByRole('button', { name: 'Add entry' }).click();
		await page.getByTestId('apply-apply').click();
		await expect(page.getByTestId('apply-status')).toContainText('roll back in', {
			timeout: slow(30_000),
		});
		await expect(page.getByText('Configuration applied.')).toBeVisible({
			timeout: slow(120_000),
		});
		await expect(page.getByTestId('uhttpd-listeners')).toContainText('0.0.0.0:8088', {
			timeout: slow(30_000),
		});
		const rpc = await api();
		expect(await rpc.uci.get('uhttpd', 'main', 'http_keepalive')).toBe('25');
	});

	test("uhttpd: an unconfirmed change that drops the browser's listener rolls back", async () => {
		test.setTimeout(slow(240_000));
		const rpc = await api();
		const model = new UciModel(rpc.uci);
		await model.load('uhttpd');
		const original = model.get('uhttpd', 'main', 'listen_http');
		// Only a port the browser does not use.
		model.set('uhttpd', 'main', 'listen_http', ['0.0.0.0:8089']);
		let unreachableSeen = false;
		const result = await applyChanges(model, {
			probe: async () => {
				const ok = await probe();
				if (!ok) unreachableSeen = true;
				return ok;
			},
			shouldConfirm: () => false,
			timeout: slow(30),
			holdoffMs: 2000,
			recoveryMs: 120_000,
		});
		expect(result.phase).toBe('rolled-back');
		expect(unreachableSeen).toBe(true);
		await expect.poll(probe, { timeout: slow(60_000) }).toBe(true);
		const fresh = await api();
		expect(await fresh.uci.get('uhttpd', 'main', 'listen_http')).toEqual(original);
	});
});
