// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, ok, here, done } from 'harness';
import { uci_stub, ubus_stub } from 'stubs';
import { leases, hosts, parse_dnsmasq_leases, parse_arp } from 'nuci.dhcp';

const ROOT = here() + '/fixtures/root';
const uci = uci_stub({ dhcp: {
	cfg01: { '.type': 'dnsmasq' },
	h1: { '.type': 'host', name: 'nas', mac: '52:54:00:AA:BB:CC', ip: '192.168.1.20' },
} });
const ubus = ubus_stub({ 'dhcp.ipv6leases': { device: { 'br-lan': { leases: [ {
	duid: '0001000abc', iaid: 1, hostname: 'tv', valid: 3000,
	'ipv6-addr': [ { address: 'fd00::200', 'preferred-lifetime': 100, 'valid-lifetime': 3000 } ]
} ] } } } });

test('parse_dnsmasq_leases handles v4, infinite and dnsmasq DHCPv6 entries', () => {
	let l = parse_dnsmasq_leases(
		'1000 52:54:00:12:34:56 192.168.1.100 laptop 01:aa\n0 52:54:00:AA:BB:CC 192.168.1.20 * *\nduid 00:01\n1500 7 fd00::100 phone 00:01:00:01\n', 900);
	eq(l, [
		{ family: 'ipv4', address: '192.168.1.100', expires: 100, hostname: 'laptop', macaddr: '52:54:00:12:34:56' },
		{ family: 'ipv4', address: '192.168.1.20', expires: -1, macaddr: '52:54:00:aa:bb:cc' },
		{ family: 'ipv6', address: 'fd00::100', expires: 600, hostname: 'phone', duid: '00:01:00:01' },
	]);
});

test('leases merges the dnsmasq file with odhcpd', () => {
	let l = leases({ root: ROOT, uci, ubus });
	eq(map(l, x => x.address), [ '192.168.1.100', '192.168.1.20', 'fd00::100', 'fd00::200' ]);
	eq(l[3], { family: 'ipv6', address: 'fd00::200', duid: '0001000abc', expires: 3000, interface: 'br-lan', hostname: 'tv' });
	eq(ubus.calls[0], [ 'dhcp', 'ipv6leases', {} ]);
});

test('leases works without odhcpd', () => {
	eq(length(leases({ root: ROOT, uci, ubus: ubus_stub({}) })), 3);
});

test('hosts merges static leases, leases and ARP by MAC', () => {
	let h = hosts({ root: ROOT, uci });
	let byMac = {};
	for (let x in h) byMac[x.macaddr] = x;
	eq(byMac['52:54:00:aa:bb:cc'], { macaddr: '52:54:00:aa:bb:cc', ipv4: [ '192.168.1.20' ], ipv6: [], hostname: 'nas' });
	eq(byMac['52:54:00:12:34:56'].hostname, 'laptop');
	eq(byMac['52:55:c0:a8:01:02'].ipv4, [ '192.168.1.2' ]);
	eq(length(parse_arp('IP address HW type Flags HW address Mask Device\n1.2.3.4 0x1 0x0 00:00:00:00:00:00 * eth0\n')), 0);
});

done();
