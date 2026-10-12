// SPDX-License-Identifier: Apache-2.0
// Typed wrappers against fixtures recorded from a real 25.12 router.

import { describe, expect, it } from 'vitest';
import { Acl } from './acl';
import { createApi } from './api';
import { NULL_SESSION, RpcClient } from './client';
import { fixtureHandler, loadFixtures, mockFetch } from './test/mock-ubus';

const fixtures = loadFixtures();
function api() {
	const m = mockFetch(fixtureHandler(fixtures));
	const client = new RpcClient({ fetch: m.fetch, storage: null });
	return { api: createApi(client), client, m };
}

describe('typed wrappers (25.12 fixtures)', () => {
	it('system.board uses the null session', async () => {
		const { api: a, m } = api();
		const board = await a.system.board();
		expect(board.release.distribution).toBe('OpenWrt');
		expect((m.requests[0] as { params: string[] }).params[0]).toBe(NULL_SESSION);
	});

	it('system.info', async () => {
		const info = await api().api.system.info();
		expect(info.load).toHaveLength(3);
		expect(info.memory.total).toBeGreaterThan(0);
	});

	it('uci get variants unwrap values', async () => {
		const { api: a } = api();
		const system = await a.uci.getAll('system');
		const first = Object.values(system).find((s) => s['.type'] === 'system');
		expect(first?.hostname).toBeTypeOf('string');
		expect((await a.uci.getSection('network', 'lan'))['.type']).toBe('interface');
		expect(await a.uci.get('network', 'lan', 'ipaddr')).toEqual(['192.168.1.1/24']);
		expect(await a.uci.changes()).toEqual({});
	});

	it('network.interfaces unwraps the dump', async () => {
		const ifaces = await api().api.network.interfaces();
		expect(ifaces.map((i) => i.interface)).toContain('lan');
	});

	it('network.wireless reads radio status through nuci.wifi', async () => {
		const radios = await api().api.network.wireless();
		expect(Object.keys(radios)).toEqual(['radio0', 'radio1']);
		expect(radios.radio0?.config.band).toBe('2g');
	});

	it('network.wireless is empty when nuci.wifi is missing', async () => {
		const m = mockFetch(() => ({ error: { code: -32000, message: 'Object not found' } }));
		const a = createApi(new RpcClient({ fetch: m.fetch, storage: null }));
		await expect(a.network.wireless()).resolves.toEqual({});
	});

	it('session.access returns an Acl', async () => {
		const acl = await api().api.session.access();
		expect(acl).toBeInstanceOf(Acl);
		expect(acl.canCall('system', 'info')).toBe(true);
	});

	it('every recorded signature exists for the wrapped stock objects', () => {
		for (const obj of ['session', 'system', 'uci', 'rc', 'log', 'iwinfo', 'dhcp', 'file']) {
			expect(fixtures.get(obj)?.calls.length, obj).toBeGreaterThan(0);
		}
		const sig = (
			fixtures.get('uci') as unknown as { signature: Record<string, Record<string, string>> }
		).signature;
		for (const m of [
			'get',
			'set',
			'add',
			'delete',
			'apply',
			'confirm',
			'rollback',
			'changes',
			'revert',
		])
			expect(sig[m], `uci.${m}`).toBeDefined();
		expect(Object.keys(sig.apply ?? {})).toEqual(
			expect.arrayContaining(['rollback', 'timeout']),
		);
	});
});

describe('Acl', () => {
	const acl = new Acl({
		ubus: { 'network.interface.*': ['status'], system: ['board', 'info'], 'nuci.*': ['*'] },
		uci: { system: ['read', 'write'], network: ['read'] },
		'access-group': { 'nuci-status': ['read'] },
	});
	it('honors fnmatch-style globs', () => {
		expect(acl.canCall('network.interface.lan', 'status')).toBe(true);
		expect(acl.canCall('network.interface.lan', 'up')).toBe(false);
		expect(acl.canCall('nuci.status', 'realtime')).toBe(true);
		expect(acl.canCall('system', 'reboot')).toBe(false);
	});
	it('checks uci configs and groups', () => {
		expect(acl.canUci('system', 'write')).toBe(true);
		expect(acl.canUci('network', 'write')).toBe(false);
		expect(acl.hasGroup('nuci-status')).toBe(true);
		expect(acl.hasGroup('nuci-status', 'write')).toBe(false);
	});
});
