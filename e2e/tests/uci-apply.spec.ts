// SPDX-License-Identifier: Apache-2.0
// Phase 1 exit: the apply protocol (ADR-0002) against the real router.
// Drives @nuci/rpc + @nuci/uci directly; the System/Network pages come later.

import { expect, test } from '@playwright/test';
import { createRpc } from '../../packages/rpc/src/index.ts';
import { applyChanges } from '../../packages/uci/src/apply.ts';
import { UciModel } from '../../packages/uci/src/model.ts';
import { rootPassword } from '../lib/router';
import { slow } from '../lib/timing';

const base = `http://127.0.0.1:${process.env.NUCI_HTTP_PORT ?? '8080'}`;

async function setup() {
	const rpc = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await rpc.session.login('root', rootPassword());
	// Same probe as the web app: a reused keep-alive connection survives an
	// address change, so ask the router whether this connection's address is
	// still assigned (ADR-0002).
	const probe = async () => {
		try {
			const res = await fetch(`${base}/nuci/probe`, { signal: AbortSignal.timeout(2000) });
			return res.ok && ((await res.json()) as { ok?: boolean }).ok === true;
		} catch {
			return false;
		}
	};
	return { rpc, model: new UciModel(rpc.uci), probe };
}

test.describe.configure({ mode: 'serial' });

test('hostname change round-trips with apply + confirm', async () => {
	test.setTimeout(slow(120_000));
	const { rpc, model, probe } = await setup();
	await model.load('system');
	const original = model.get('system', '@system[0]', 'hostname');
	const name = `nuci-e2e-${Date.now().toString(36)}`;

	model.set('system', '@system[0]', 'hostname', name);
	const phases: string[] = [];
	const result = await applyChanges(model, {
		probe,
		timeout: slow(60),
		holdoffMs: 3000,
		onState: (s) => phases.push(s.phase),
	});
	expect(result.phase).toBe('confirmed');
	expect(phases).toContain('confirming');
	expect(model.pendingCount).toBe(0);

	// committed and live: uci and the running system agree
	expect(
		await rpc.uci.get('system', model.resolveSection('system', '@system[0]')!, 'hostname'),
	).toBe(name);
	await expect
		.poll(async () => (await rpc.system.board()).hostname, { timeout: slow(30_000) })
		.toBe(name);

	// restore
	model.set('system', '@system[0]', 'hostname', original ?? 'OpenWrt');
	expect((await applyChanges(model, { probe, timeout: slow(60), holdoffMs: 3000 })).phase).toBe(
		'confirmed',
	);
	await rpc.session.logout();
});

test('LAN address change without confirm rolls back', async () => {
	test.setTimeout(slow(240_000));
	const { rpc, model, probe } = await setup();
	await model.load('network');
	const original = model.get('network', 'lan', 'ipaddr');
	expect(original).toBeDefined();

	model.set('network', 'lan', 'ipaddr', ['192.168.1.10/24']);
	let unreachableSeen = false;
	const result = await applyChanges(model, {
		probe: async () => {
			const ok = await probe();
			if (!ok) unreachableSeen = true;
			return ok;
		},
		// The user never confirms: the router must restore the old address by itself.
		shouldConfirm: () => false,
		timeout: slow(30),
		holdoffMs: 2000,
		recoveryMs: 120_000,
	});
	expect(result.phase).toBe('rolled-back');
	expect(unreachableSeen).toBe(true);

	// Reachable on the old address with the old config, nothing pending.
	await expect.poll(probe, { timeout: slow(60_000) }).toBe(true);
	const fresh = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await fresh.session.login('root', rootPassword());
	expect(await fresh.uci.get('network', 'lan', 'ipaddr')).toEqual(original);
	const lan = await fresh.network.interface('lan');
	expect(lan['ipv4-address']?.[0]?.address).toBe('192.168.1.1');
	await fresh.session.logout();
	await rpc.session.logout().catch(() => {});
});

test('a LAN change that locks the browser out is never confirmed, even by an eager UI', async () => {
	test.setTimeout(slow(240_000));
	const { model, probe } = await setup();
	await model.load('network');
	const original = model.get('network', 'lan', 'ipaddr');

	// Default ApplyBar behaviour: confirm as soon as the probe succeeds. A
	// reused keep-alive connection must not count (ADR-0002 addendum).
	model.set('network', 'lan', 'ipaddr', ['192.168.1.20/24']);
	const result = await applyChanges(model, {
		probe,
		timeout: slow(30),
		holdoffMs: 2000,
		recoveryMs: 120_000,
	});
	expect(result.phase).toBe('rolled-back');

	const fresh = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await fresh.session.login('root', rootPassword());
	expect(await fresh.uci.get('network', 'lan', 'ipaddr')).toEqual(original);
	await fresh.session.logout();
});
