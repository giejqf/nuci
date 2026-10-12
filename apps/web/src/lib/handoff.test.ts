// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
	browserAddress,
	configuredAddresses,
	handoffTarget,
	handoffUrl,
	HANDOFF_RE,
} from './handoff';

const view = (lan: string | string[]) => ({
	sections: () => [
		{ '.name': 'lan', '.type': 'interface', '.anonymous': false, proto: 'static', ipaddr: lan },
		{ '.name': 'wan', '.type': 'interface', '.anonymous': false, proto: 'dhcp' },
	],
});

describe('handoff', () => {
	it('only applies to literal IPv4 hosts', () => {
		expect(browserAddress('192.168.1.1')).toBe('192.168.1.1');
		expect(browserAddress('router.lan')).toBeNull();
	});

	it('finds the new LAN address when the browser address is removed', () => {
		const staged = configuredAddresses(view(['192.168.2.1/24']));
		expect(handoffTarget('192.168.1.1', 'lan', staged)).toBe('192.168.2.1');
	});

	it('does nothing when the address is kept (or moved to another interface)', () => {
		expect(
			handoffTarget(
				'192.168.1.1',
				'lan',
				configuredAddresses(view(['192.168.1.1/24', '10.0.0.1/8'])),
			),
		).toBeNull();
		expect(
			handoffTarget('192.168.1.1', 'lan', configuredAddresses(view('192.168.1.1/24'))),
		).toBeNull();
		expect(handoffTarget(null, 'lan', configuredAddresses(view('10.0.0.1/8')))).toBeNull();
	});

	it('builds the confirm URL on the new origin', () => {
		const sid = 'a'.repeat(32);
		const url = handoffUrl('192.168.2.1', sid, {
			protocol: 'http:',
			port: '',
			pathname: '/nuci/',
		});
		expect(url).toBe(`http://192.168.2.1/nuci/#/apply/confirm/${sid}`);
		expect(HANDOFF_RE.exec(new URL(url).hash)?.[1]).toBe(sid);
	});
});
