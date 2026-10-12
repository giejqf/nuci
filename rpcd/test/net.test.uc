// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, ok, done } from 'harness';
import { run_stub, uci_stub, ubus_stub } from 'stubs';
import { parse_ip_addr, normalize_addr, address_present, address_planned } from 'nuci.net';

const IP = `1: lo    inet 127.0.0.1/8 scope host lo\\       valid_lft forever preferred_lft forever
1: lo    inet6 ::1/128 scope host \\       valid_lft forever preferred_lft forever
16: br-lan    inet 192.168.1.1/24 brd 192.168.1.255 scope global br-lan\\       valid_lft forever preferred_lft forever
16: br-lan    inet6 fdee:f229:6062::1/60 scope global noprefixroute \\       valid_lft forever preferred_lft forever
16: br-lan    inet6 fe80::5054:ff:fe12:3456/64 scope link \\       valid_lft forever preferred_lft forever
`;
const ctx = { run: run_stub(null, { 'ip -o addr show': IP }) };

test('parse_ip_addr lists v4 and v6 addresses', () => {
	eq(parse_ip_addr(IP), [ '127.0.0.1', '::1', '192.168.1.1', 'fdee:f229:6062::1', 'fe80::5054:ff:fe12:3456' ]);
});

test('normalize_addr strips brackets, zones and v4-mapped prefixes', () => {
	eq(normalize_addr('[FE80::5054:FF:FE12:3456%br-lan]'), 'fe80::5054:ff:fe12:3456');
	eq(normalize_addr('::ffff:192.168.1.1'), '192.168.1.1');
	eq(normalize_addr(null), '');
});

test('address_present detects a removed address', () => {
	ok(address_present(ctx, '192.168.1.1'));
	ok(address_present(ctx, '::ffff:192.168.1.1'));
	ok(!address_present(ctx, '192.168.1.10'));
	ok(!address_present(ctx, ''));
});

const DUMP = { interface: [
	{ interface: 'lan', proto: 'static', 'ipv4-address': [ { address: '192.168.1.1', mask: 24 } ], 'ipv6-address': [ { address: 'fd00::1', mask: 64 } ] },
	{ interface: 'wan', proto: 'dhcp', 'ipv4-address': [ { address: '10.0.2.15', mask: 24 } ] },
] };
const planned = (lan) => ({ ubus: ubus_stub({ 'network.interface.dump': DUMP }), uci: uci_stub({ network: lan ? { lan } : {} }) });

test('address_planned: committed static config keeps or drops the address', () => {
	ok(address_planned(planned({ '.type': 'interface', proto: 'static', ipaddr: '192.168.1.1/24' }), '192.168.1.1'));
	ok(address_planned(planned({ '.type': 'interface', proto: 'static', ipaddr: [ '192.168.1.1/24', '10.9.0.1/24' ] }), '192.168.1.1'));
	ok(!address_planned(planned({ '.type': 'interface', proto: 'static', ipaddr: [ '192.168.1.20/24' ] }), '192.168.1.1'));
	ok(!address_planned(planned({ '.type': 'interface', proto: 'dhcp' }), '192.168.1.1'));
	ok(!address_planned(planned({ '.type': 'interface', proto: 'static', ipaddr: '192.168.1.1/24', disabled: '1' }), '192.168.1.1'));
	ok(!address_planned(planned(null), '192.168.1.1'), 'interface removed');
});

test('address_planned leaves dynamic and unknown addresses to the live check', () => {
	let c = planned({ '.type': 'interface', proto: 'static', ipaddr: '192.168.1.20/24' });
	ok(address_planned(c, '10.0.2.15'), 'dhcp-assigned wan');
	ok(address_planned(c, '203.0.113.1'), 'not a live address');
	ok(address_planned(planned({ '.type': 'interface', proto: 'static', ipaddr: '192.168.1.1/24' }), 'fd00::1'), 'derived v6');
});

done();
