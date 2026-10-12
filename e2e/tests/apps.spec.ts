// SPDX-License-Identifier: Apache-2.0
// Phase 10: the first nuci-apps on the lab router (exit criteria in AGENTS.md).

import { expect, test, type Page } from '@playwright/test';
import { createRpc } from '../../packages/rpc/src/index.ts';
import { rootPassword } from '../lib/router';
import { login } from '../lib/ui';

const base = `http://127.0.0.1:${process.env.NUCI_HTTP_PORT ?? '8080'}`;
const upnpBase = `http://127.0.0.1:${process.env.NUCI_UPNP_PORT ?? '8085'}`;

async function api() {
	const rpc = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await rpc.session.login('root', rootPassword());
	return rpc;
}

async function applyWithRollback(page: Page) {
	await page.getByTestId('apply-apply').click();
	await expect(page.getByTestId('apply-status')).toContainText('roll back in', {
		timeout: 30_000,
	});
	await expect(page.getByText('Configuration applied.')).toBeVisible({ timeout: 120_000 });
}

async function addListEntry(page: Page, testid: string, label: string, value: string) {
	const list = page.getByTestId(testid);
	await list.getByLabel(`New entry for ${label}`).fill(value);
	await list.getByRole('button', { name: 'Add entry' }).click();
}

test.describe.configure({ mode: 'serial' });

// Leftovers of an interrupted run would make "create" fail; start clean.
test.beforeAll(async () => {
	const rpc = await api();
	const net = await rpc.uci.getAll('network');
	let dirty = false;
	for (const [name, sec] of Object.entries(net))
		if (/^wge2e\d$/.test(name) || /^wireguard_wge2e\d$/.test(sec['.type'])) {
			await rpc.uci.delete('network', name);
			dirty = true;
		}
	for (const [name, sec] of Object.entries(await rpc.uci.getAll('firewall')))
		if (String(sec.name ?? '').startsWith('Allow-WireGuard-wge2e')) {
			await rpc.uci.delete('firewall', name);
			dirty = true;
		}
	for (const [name, sec] of Object.entries(await rpc.uci.getAll('ddns')))
		if (sec.domain === 'e2e.example') {
			await rpc.uci.delete('ddns', name);
			dirty = true;
		}
	if (dirty) await rpc.uci.apply(false);
});

test('wireguard: two tunnels peer over the loopback and complete a handshake; peer export', async ({
	page,
}) => {
	test.setTimeout(420_000);
	await login(page, 'network/wireguard');
	await expect(page.getByRole('heading', { name: 'WireGuard', level: 1 })).toBeVisible();

	const create = async (name: string, port: string, addr: string, zone: string, wan: boolean) => {
		await page.getByTestId('wg-add').click();
		const modal = page.getByTestId('wg-add-modal');
		await page.getByTestId('wg-new-name').fill(name);
		await page.getByTestId('wg-new-port').fill(port);
		await page.getByTestId('wg-new-address').fill(addr);
		await modal.getByLabel('Firewall zone').selectOption(zone);
		await modal.getByLabel('Allow incoming connections from WAN').setChecked(wan);
		await page.getByTestId('wg-new-create').click();
		await expect(page.getByTestId(`wg-tunnel-${name}`)).toBeVisible();
	};
	await create('wge2e0', '51820', '10.9.0.1/24', 'lan', true);
	await create('wge2e1', '51821', '10.9.1.1/24', '', false);
	await applyWithRollback(page);

	const key = (name: string) =>
		expect.poll(async () => (await page.getByTestId(`wg-${name}-pubkey`).innerText()).trim(), {
			timeout: 30_000,
		});
	await key('wge2e0').toMatch(/^[A-Za-z0-9+/]{43}=$/);
	await key('wge2e1').toMatch(/^[A-Za-z0-9+/]{43}=$/);
	const pub0 = (await page.getByTestId('wg-wge2e0-pubkey').innerText()).trim();
	const pub1 = (await page.getByTestId('wg-wge2e1-pubkey').innerText()).trim();

	const peer = async (tunnel: string, desc: string, setup: () => Promise<void>) => {
		await page.getByTestId(`wg-${tunnel}-peers-add`).click();
		await page.getByTestId('wg-peer-description').fill(desc);
		await setup();
		await page.getByTestId(`wg-${tunnel}-peers-done`).click();
	};
	await peer('wge2e0', 'other-end', async () => {
		await page.getByTestId('wg-peer-pubkey').fill(pub1);
		await addListEntry(page, 'wg-peer-allowed', 'Allowed IPs', '10.9.1.1/32');
	});
	await peer('wge2e1', 'first-end', async () => {
		await page.getByTestId('wg-peer-pubkey').fill(pub0);
		await addListEntry(page, 'wg-peer-allowed', 'Allowed IPs', '10.9.0.1/32');
		await page.getByTestId('wg-peer-endpoint-host').fill('127.0.0.1');
		await page.getByTestId('wg-peer-endpoint-port').fill('51820');
	});
	await peer('wge2e0', 'phone', async () => {
		await page.getByTestId('wg-peer-genkey').click();
		await expect(page.getByTestId('wg-peer-pubkey')).toHaveValue(/^[A-Za-z0-9+/]{43}=$/);
		await addListEntry(page, 'wg-peer-allowed', 'Allowed IPs', '10.9.0.2/32');
	});
	await applyWithRollback(page);

	// Handshake: wge2e1 reaches wge2e0 at 127.0.0.1:51820 (persistent keepalive).
	const rpc = await api();
	await expect
		.poll(
			async () => {
				const s = await rpc.client.call<{
					interfaces: Record<
						string,
						{ peers: { public_key: string; latest_handshake: number }[] }
					>;
				}>('nuci.wireguard', 'status');
				return (
					s.interfaces.wge2e0?.peers.find((p) => p.public_key === pub1)
						?.latest_handshake ?? 0
				);
			},
			{ timeout: 90_000 },
		)
		.toBeGreaterThan(0);
	await expect(
		page.getByTestId('wg-wge2e0-status').getByRole('row', { name: /other-end/ }),
	).toContainText('ago', { timeout: 30_000 });

	// Export for the peer whose keys were generated on the router.
	await page.getByRole('button', { name: 'Configuration for phone' }).click();
	await expect(page.getByTestId('wg-config')).toHaveValue(
		/\[Interface\]\nPrivateKey = .+\nAddress = 10\.9\.0\.2\/32/,
	);
	await expect(page.getByTestId('wg-config')).toHaveValue(
		new RegExp(`PublicKey = ${pub0.replace(/[+/]/g, '\\$&')}`),
	);
	await expect(page.getByTestId('wg-qr')).toBeVisible();
	await page.getByTestId('wg-export').getByRole('button', { name: 'Close' }).click();

	await page.getByRole('button', { name: 'Delete tunnel wge2e0' }).click();
	await page.getByRole('button', { name: 'Delete tunnel wge2e1' }).click();
	await applyWithRollback(page);
	await expect
		.poll(async () => Object.keys(await rpc.uci.getAll('network')))
		.not.toContain('wge2e0');
	const fw = Object.values(await rpc.uci.getAll('firewall'));
	expect(fw.some((s) => String(s.name ?? '').startsWith('Allow-WireGuard-'))).toBe(false);
});

test('ddns: a service updates through a custom URL and shows its status and log', async ({
	page,
}) => {
	test.setTimeout(300_000);
	await login(page, 'services/ddns');
	await page.getByTestId('ddns-private').check();
	await page.getByTestId('ddns-services-add').click();
	await page.getByTestId('ddns-url').fill('http://127.0.0.1/nuci/index.html?ip=[IP]');
	await page.getByTestId('ddns-domain').fill('e2e.example');
	await page.getByTestId('ddns-lookup').fill('localhost');
	await page.getByTestId('ddns-services-done').click();
	await applyWithRollback(page);

	await page.getByTestId('ddns-update').click();
	const row = page.getByTestId('ddns-services').getByRole('row', { name: /e2e\.example/ });
	await expect(row).toContainText('updated', { timeout: 90_000 });
	await expect(row).toContainText('running');
	await row.getByRole('button', { name: 'Edit e2e.example' }).click();
	await page.getByTestId('ddns-log').click();
	await expect(page.getByTestId('ddns-log-text')).toContainText('Update successful');
	await page.getByRole('button', { name: 'Close' }).last().click();
	await page.getByTestId('ddns-services-done').click();

	await row.getByRole('button', { name: 'Delete e2e.example' }).click();
	await page.getByTestId('ddns-private').uncheck();
	await applyWithRollback(page);
});

async function soap(action: string, body: string) {
	const desc = await (await fetch(`${upnpBase}/rootDesc.xml`)).text();
	const st = /urn:schemas-upnp-org:service:WANIPConnection:\d/.exec(desc)?.[0];
	const ctl = new RegExp(`${st}</serviceType>[\\s\\S]*?<controlURL>([^<]+)`).exec(desc)?.[1];
	expect(st && ctl).toBeTruthy();
	return (
		await fetch(`${upnpBase}${ctl}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'text/xml; charset="utf-8"',
				SOAPAction: `"${st}#${action}"`,
			},
			body: `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${st}">${body}</u:${action}></s:Body></s:Envelope>`,
		})
	).text();
}

test('upnp: a mapping requested by a LAN client appears in the list', async ({ page }) => {
	test.setTimeout(300_000);
	await login(page, 'services/upnp');
	await page.getByTestId('upnp-enabled').check();
	// QEMU's WAN address is private; report a public one so mappings are allowed.
	await page.getByTestId('upnp-external-ip').fill('1.2.3.4');
	await applyWithRollback(page);
	await expect(page.getByTestId('upnp-state')).toHaveText('running', { timeout: 30_000 });

	// Through the lab's port forward the request comes from 192.168.1.2 (secure mode).
	const res = await soap(
		'AddPortMapping',
		'<NewRemoteHost></NewRemoteHost><NewExternalPort>40000</NewExternalPort><NewProtocol>TCP</NewProtocol><NewInternalPort>40000</NewInternalPort><NewInternalClient>192.168.1.2</NewInternalClient><NewEnabled>1</NewEnabled><NewPortMappingDescription>nuci-e2e</NewPortMappingDescription><NewLeaseDuration>3600</NewLeaseDuration>',
	);
	expect(res).toContain('AddPortMappingResponse');
	const row = page.getByTestId('upnp-redirects').getByRole('row', { name: /nuci-e2e/ });
	await expect(row).toContainText('40000', { timeout: 15_000 });
	await expect(row).toContainText('192.168.1.2');

	await soap(
		'DeletePortMapping',
		'<NewRemoteHost></NewRemoteHost><NewExternalPort>40000</NewExternalPort><NewProtocol>TCP</NewProtocol>',
	);
	await expect(row).toHaveCount(0, { timeout: 15_000 });
	await page.getByTestId('upnp-external-ip').fill('');
	await page.getByTestId('upnp-enabled').uncheck();
	await applyWithRollback(page);
});

test('sqm: enabling the wan queue installs cake', async ({ page }) => {
	test.setTimeout(300_000);
	await login(page, 'network/sqm');
	const queues = page.getByTestId('sqm-queues');
	await queues.getByRole('button', { name: 'Edit eth1' }).click();
	await page.getByTestId('sqm-enabled').check();
	await page.getByTestId('sqm-download').fill('50000');
	await page.getByTestId('sqm-queues-done').click();
	await applyWithRollback(page);

	const rpc = await api();
	await expect
		.poll(
			async () =>
				(
					await rpc.client.call<{
						interfaces: Record<
							string,
							{ egress: { kind: string }[]; ingress: { bandwidth?: string }[] }
						>;
					}>('nuci.sqm', 'status')
				).interfaces.eth1,
			{ timeout: 60_000 },
		)
		.toMatchObject({ egress: [{ kind: 'cake' }], ingress: [{ bandwidth: '50Mbit' }] });
	await expect(page.getByTestId('sqm-status-eth1')).toContainText('cake', { timeout: 15_000 });

	await queues.getByRole('button', { name: 'Edit eth1' }).click();
	await page.getByTestId('sqm-enabled').uncheck();
	await page.getByTestId('sqm-queues-done').click();
	await applyWithRollback(page);
});
