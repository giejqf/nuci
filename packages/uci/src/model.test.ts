// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it } from 'vitest';
import { UciModel } from './model';
import { parseRef } from './path';
import { FakeRpcdUci, fixtureConfigs } from './test/fake-rpcd';

let rpcd: FakeRpcdUci;
let model: UciModel;

beforeEach(async () => {
	rpcd = new FakeRpcdUci(fixtureConfigs());
	model = new UciModel(rpcd);
	await model.load('system', 'network');
});

describe('references', () => {
	it('parses names and selectors', () => {
		expect(parseRef('network.lan.ipaddr')).toEqual({
			config: 'network',
			section: 'lan',
			option: 'ipaddr',
		});
		expect(parseRef('system.@system[0].hostname')).toEqual({
			config: 'system',
			section: '@system[0]',
			option: 'hostname',
		});
		expect(parseRef('firewall.@zone[-1]')).toEqual({
			config: 'firewall',
			section: '@zone[-1]',
		});
		expect(() => parseRef('network.lan.ip addr')).toThrow();
		expect(() => parseRef('a')).toThrow();
	});

	it('resolves @type[i] against the staged view', () => {
		expect(model.resolve('system.@system[0].hostname')).toEqual({
			config: 'system',
			section: 'cfg01e48a',
			option: 'hostname',
		});
		expect(model.resolveSection('network', '@interface[-1]')).toBe('wan');
		expect(model.resolveSection('network', '@interface[9]')).toBeUndefined();
	});
});

describe('staging', () => {
	it('loads each config once', async () => {
		await model.load('system', 'network');
		expect(rpcd.log.filter((l) => l[0] === 'getAll')).toHaveLength(2);
	});

	it('stages sets locally until save', () => {
		model.set('system', '@system[0]', 'hostname', 'router');
		expect(model.get('system', '@system[0]', 'hostname')).toBe('router');
		expect(model.getBase('system', 'cfg01e48a', 'hostname')).toBe('OpenWrt');
		expect(model.changes()).toEqual([
			{
				kind: 'set',
				config: 'system',
				section: 'cfg01e48a',
				type: 'system',
				option: 'hostname',
				from: 'OpenWrt',
				to: 'router',
			},
		]);
		expect(rpcd.log.some((l) => l[0] === 'set')).toBe(false);
	});

	it('setting a value back to the original clears the change', () => {
		model.set('system', 'cfg01e48a', 'hostname', 'router');
		model.set('system', 'cfg01e48a', 'hostname', 'OpenWrt');
		expect(model.dirty).toBe(false);
	});

	it('empty values unset options', () => {
		model.set('system', 'ntp', 'server', []);
		model.set('system', 'cfg01e48a', 'zonename', '');
		expect(model.changes().map((c) => [c.kind, 'option' in c ? c.option : ''])).toEqual([
			['unset', 'zonename'],
			['unset', 'server'],
		]);
	});

	it('adds, removes and reorders sections', () => {
		const a = model.add('network', 'interface', undefined, { proto: 'none' });
		const b = model.add('network', 'interface', 'guest', {
			proto: 'static',
			ipaddr: '10.0.0.1/24',
		});
		model.remove('network', 'wan');
		model.order('network', ['guest', 'lan']);
		expect(a).toMatch(/^_new\d+$/);
		expect(b).toBe('guest');
		expect(model.sections('network').map((s) => s['.name'])).toEqual([
			'guest',
			'lan',
			'loopback',
			a,
		]);
		const kinds = model.changes('network').map((c) => c.kind);
		expect(kinds).toEqual(['remove', 'add', 'add', 'order']);
		expect(() => model.add('network', 'interface', 'lan')).toThrow();
		expect(model.add('wireless', 'wifi-iface')).toMatch(/^_new\d+$/);
		expect(() => model.add('wireless', 'wifi iface')).toThrow();
	});

	it('rejects invalid option names and unknown sections', () => {
		expect(() => model.set('network', 'lan', '.type', 'x')).toThrow();
		expect(() => model.set('network', 'nope', 'proto', 'x')).toThrow();
	});

	it('notifies subscribers', () => {
		let n = 0;
		model.subscribe(() => n++);
		model.set('network', 'lan', 'proto', 'dhcp');
		model.revertLocal();
		expect(n).toBe(2);
		expect(model.dirty).toBe(false);
	});
});

describe('save', () => {
	it('pushes a minimal set of uci calls and reloads', async () => {
		model.set('system', '@system[0]', 'hostname', 'router');
		model.set('system', 'ntp', 'server', ['pool.ntp.org']);
		model.set('system', 'ntp', 'enabled', null);
		const anon = model.add('network', 'interface', undefined, { proto: 'none' });
		model.remove('network', 'wan');
		model.order('network', [anon, 'lan']);
		await model.save();

		const calls = rpcd.log.filter((l) => l[0] !== 'getAll');
		expect(calls).toContainEqual(['set', 'system', 'cfg01e48a', { hostname: 'router' }]);
		expect(calls).toContainEqual(['set', 'system', 'ntp', { server: ['pool.ntp.org'] }]);
		expect(calls).toContainEqual(['delete', 'system', 'ntp', ['enabled']]);
		expect(calls).toContainEqual(['add', 'network', 'interface', { proto: 'none' }, undefined]);
		expect(calls).toContainEqual(['delete', 'network', 'wan', undefined]);
		const order = calls.find((c) => c[0] === 'order');
		expect(order?.[2]).toEqual(['cfg000001', 'lan', 'loopback']);

		expect(model.dirty).toBe(false);
		expect(model.get('system', '@system[0]', 'hostname')).toBe('router');
		expect(model.pendingCount).toBeGreaterThan(0);
		expect(model.pending.system).toBeDefined();
	});

	it('revertPending discards the session delta', async () => {
		model.set('system', '@system[0]', 'hostname', 'router');
		await model.save();
		await model.revertPending();
		expect(model.pendingCount).toBe(0);
		expect(model.get('system', '@system[0]', 'hostname')).toBe('OpenWrt');
	});
});

describe('draft sections', () => {
	it('are editable but not changes until confirmed', async () => {
		const name = model.add(
			'network',
			'route',
			undefined,
			{ target: '10.0.0.0/8' },
			{ draft: true },
		);
		model.set('network', name, 'interface', 'lan');
		expect(model.get('network', name, 'interface')).toBe('lan');
		expect(model.sections('network', 'route').map((s) => s['.name'])).toContain(name);
		expect(model.changes()).toEqual([]);
		expect(model.dirty).toBe(false);

		model.confirmDraft('network', name);
		expect(model.changes()).toEqual([
			{
				kind: 'add',
				config: 'network',
				section: name,
				type: 'route',
				values: { target: '10.0.0.0/8', interface: 'lan' },
			},
		]);
	});

	it('vanish without a trace when removed', () => {
		const name = model.add('network', 'route', undefined, {}, { draft: true });
		model.remove('network', name);
		expect(model.getSection('network', name)).toBeUndefined();
		expect(model.changes()).toEqual([]);
	});

	it('survive a save of other edits and are not sent', async () => {
		const name = model.add(
			'network',
			'route',
			undefined,
			{ target: '10.0.0.0/8' },
			{ draft: true },
		);
		model.set('network', 'lan', 'ipaddr', '192.168.2.1');
		await model.save();
		expect(rpcd.log.some(([m]) => m === 'add')).toBe(false);
		expect(model.get('network', name, 'target')).toBe('10.0.0.0/8');
		expect(model.changes()).toEqual([]);
		model.confirmDraft('network', name);
		expect(model.changes().map((c) => c.kind)).toEqual(['add']);
	});
});
