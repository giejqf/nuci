// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it } from 'vitest';
import { UciModel, UciStore } from '@nuci/uci';
import { FakeRpcdUci } from '../../../../packages/uci/src/test/fake-rpcd';
import { obsoleteOptions, proto } from '../pages/network/proto-registry';
import { setZone, zoneOf } from './firewall';

let store: UciStore;
beforeEach(async () => {
	store = new UciStore(
		new UciModel(
			new FakeRpcdUci({
				firewall: {
					z0: {
						'.anonymous': true,
						'.type': 'zone',
						'.name': 'z0',
						'.index': 0,
						name: 'lan',
						network: 'lan',
					},
					z1: {
						'.anonymous': true,
						'.type': 'zone',
						'.name': 'z1',
						'.index': 1,
						name: 'wan',
						network: ['wan', 'wan6'],
					},
				},
			}),
		),
	);
	await store.load('firewall');
});

describe('firewall zones', () => {
	it('finds and moves an interface between zones', () => {
		expect(zoneOf(store, 'wan6')).toBe('wan');
		setZone(store, 'wan6', 'lan');
		expect(zoneOf(store, 'wan6')).toBe('lan');
		expect(store.get('firewall', 'z0', 'network')).toEqual(['lan', 'wan6']);
		expect(store.get('firewall', 'z1', 'network')).toEqual(['wan']);
		setZone(store, 'wan6', null);
		expect(zoneOf(store, 'wan6')).toBeNull();
	});
});

describe('proto registry', () => {
	it('lists options to drop when switching protocols', () => {
		expect(obsoleteOptions('static', 'dhcp')).toEqual([
			'ipaddr',
			'gateway',
			'ip6addr',
			'ip6gw',
			'ip6assign',
		]);
		expect(obsoleteOptions('dhcp', 'none')).toContain('hostname');
		expect(proto('pppoe')?.fields.map((f) => f.option)).toContain('username');
	});
});
