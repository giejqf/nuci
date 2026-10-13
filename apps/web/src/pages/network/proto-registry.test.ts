// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { availableProtos, obsoleteOptions, PROTOS } from './proto-registry';

describe('proto registry', () => {
	it('offers only installed handlers, plus none and the current protocol', () => {
		const handlers = { static: {}, dhcp: {}, dhcpv6: {}, pppoe: {}, '6in4': {} };
		expect(availableProtos(handlers).map((p) => p.id)).toEqual([
			'static',
			'dhcp',
			'dhcpv6',
			'pppoe',
			'6in4',
			'none',
		]);
		expect(availableProtos(handlers, 'dslite').map((p) => p.id)).toContain('dslite');
		expect(availableProtos(null)).toBe(PROTOS);
	});

	it('tunnels create their own device and drop static options when switched to', () => {
		const tunnels = PROTOS.filter((p) => p.noDevice).map((p) => p.id);
		expect(tunnels).toEqual(['6in4', '6rd', 'dslite', 'ipip']);
		expect(obsoleteOptions('static', '6in4')).toContain('ipaddr');
		expect(obsoleteOptions('6in4', 'static')).toContain('peeraddr');
		// Same name, different meaning: static's address list is not ipip's local address.
		expect(obsoleteOptions('static', 'ipip')).toContain('ipaddr');
		// Same meaning: kept.
		expect(obsoleteOptions('6in4', 'ipip')).not.toContain('tunlink');
	});
});
