// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { formatPort, parsePort, setPort } from './bridge-vlan';

describe('bridge-vlan port specs', () => {
	it('parses netifd forms', () => {
		expect(parsePort('lan1')).toEqual({ port: 'lan1', mode: 'u', pvid: false });
		expect(parsePort('lan1:u*')).toEqual({ port: 'lan1', mode: 'u', pvid: true });
		expect(parsePort('lan2:t')).toEqual({ port: 'lan2', mode: 't', pvid: false });
		expect(parsePort('eth0*')).toEqual({ port: 'eth0', mode: 'u', pvid: true });
		expect(formatPort({ port: 'lan2', mode: 't', pvid: false })).toBe('lan2:t');
	});

	it('sets, changes and removes membership', () => {
		let l = setPort([], 'lan1', 'u', true);
		l = setPort(l, 'lan2', 't', false);
		expect(l).toEqual(['lan1:u*', 'lan2:t']);
		expect(setPort(l, 'lan1', 't', false)).toEqual(['lan1:t', 'lan2:t']);
		expect(setPort(l, 'lan1', null, false)).toEqual(['lan2:t']);
		// Plain netifd forms are normalised to the explicit one on edit.
		expect(setPort(['lan3'], 'lan4', 'u', false)).toEqual(['lan3:u', 'lan4:u']);
	});
});
