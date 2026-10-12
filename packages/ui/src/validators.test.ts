// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { all, cidr4, hostname, integer, ipaddr, ipv4, ipv6, port, required } from './validators';

describe('validators', () => {
	it('required', () => {
		expect(required('')).toBe('validate.required');
		expect(required(' x ')).toBeNull();
	});
	it('hostname', () => {
		expect(hostname('router-1.lan')).toBeNull();
		expect(hostname('-bad')).toBe('validate.hostname');
		expect(hostname('a'.repeat(64))).toBe('validate.hostname');
	});
	it('ipv4 / cidr4', () => {
		expect(ipv4('192.168.1.1')).toBeNull();
		expect(ipv4('256.1.1.1')).toBe('validate.ipv4');
		expect(ipv4('01.1.1.1')).toBe('validate.ipv4');
		expect(cidr4('10.0.0.1/8')).toBeNull();
		expect(cidr4('10.0.0.1')).toBeNull();
		expect(cidr4('10.0.0.1/33')).toBe('validate.cidr4');
		expect(cidr4('10.0.0.1/8/1')).toBe('validate.cidr4');
	});
	it('ipv6', () => {
		for (const ok of [
			'::1',
			'fe80::1',
			'2001:db8::',
			'fd00:1:2:3:4:5:6:7',
			'::ffff:192.168.1.1',
		])
			expect(ipv6(ok), ok).toBeNull();
		for (const bad of ['1::2::3', 'fd00:1:2:3:4:5:6:7:8', 'g::1', '::ffff:999.1.1.1'])
			expect(ipv6(bad), bad).toBe('validate.ipv6');
		expect(ipaddr('::1')).toBeNull();
	});
	it('integer / port / all', () => {
		expect(integer(1, 10)('11')).toBe('validate.range');
		expect(integer()('1.5')).toBe('validate.integer');
		expect(port('22')).toBeNull();
		expect(port('0')).toBe('validate.port');
		expect(all(required, ipv4)('')).toBe('validate.required');
	});
});

import { formatAddress } from './format';

describe('formatAddress', () => {
	it('compresses expanded IPv6 and leaves IPv4 alone', () => {
		expect(formatAddress('fe80:0000:0000:0000:5054:00ff:fe12:3457')).toBe(
			'fe80::5054:ff:fe12:3457',
		);
		expect(formatAddress('ff02:0000:0000:0000:0000:0000:0001:0002')).toBe('ff02::1:2');
		expect(formatAddress('2001:0db8:0000:0001:0000:0000:0000:0001')).toBe('2001:db8:0:1::1');
		expect(formatAddress('0000:0000:0000:0000:0000:0000:0000:0001')).toBe('::1');
		expect(formatAddress('192.168.1.1')).toBe('192.168.1.1');
	});
});
