// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, here, done } from 'harness';
import { normalize_mac, normalize_password, interfaces, wake } from 'nuci.app.wol';

const fixtures = here() + '/../../apps/nuci-app-wol/rpcd/test/fixtures';

function ctx(root, spawned, rc) {
	return { root: fixtures + '/' + root, spawn: (argv) => { push(spawned ?? [], argv); return rc ?? 0; } };
}

test('normalize_mac: separators and case; broadcast and zero are rejected', () => {
	eq(normalize_mac('AA-BB-CC-dd-ee-01'), 'aa:bb:cc:dd:ee:01');
	eq(normalize_mac('aabb.ccdd.ee01'), 'aa:bb:cc:dd:ee:01');
	eq(normalize_mac('aabbccddee01'), 'aa:bb:cc:dd:ee:01');
	eq(normalize_mac('ff:ff:ff:ff:ff:ff'), null);
	eq(normalize_mac('00:00:00:00:00:00'), null);
	eq(normalize_mac('aa:bb:cc:dd:ee'), null);
	eq(normalize_mac('aa:bb:cc:dd:ee:0g'), null);
	eq(normalize_mac(42), null);
});

test('normalize_password: 4 or 6 bytes of hex, or dotted; empty is none', () => {
	eq(normalize_password('AABBCCDDEEFF'), 'aa:bb:cc:dd:ee:ff');
	eq(normalize_password('aa:bb:cc:dd'), 'aa:bb:cc:dd');
	eq(normalize_password('192.168.1.10'), '192.168.1.10');
	eq(normalize_password(''), null);
	eq(normalize_password(null), null);
	eq(normalize_password('AABBCC'), false);
	eq(normalize_password('192.168.1.300'), false);
	eq(normalize_password('-i eth0'), false);
});

test('interfaces: Ethernet-type only, with state, bridge and master', () => {
	let r = interfaces(ctx('root'));

	eq(r.program, '/usr/bin/etherwake');
	eq(map(r.interfaces, i => i.name), [ 'br-lan', 'eth0', 'eth1', 'phy0-ap0' ]);
	eq(r.interfaces[0], { name: 'br-lan', mac: '52:54:00:12:34:56', up: true, bridge: true, master: null });
	eq(r.interfaces[1].master, 'br-lan');
	eq(r.interfaces[2].up, false);
	eq(interfaces(ctx('empty')), { program: null, interfaces: [] });
});

test('wake: argv from validated input only', () => {
	let spawned = [];

	eq(wake(ctx('root', spawned), { mac: 'AA-BB-CC-DD-EE-01', interface: 'br-lan' }),
		{ sent: true, mac: 'aa:bb:cc:dd:ee:01', interface: 'br-lan' });
	wake(ctx('root', spawned), { mac: 'aabbccddee01', interface: 'eth1', broadcast: true, password: 'AABBCCDDEEFF' });
	eq(spawned, [
		[ '/usr/bin/etherwake', '-i', 'br-lan', 'aa:bb:cc:dd:ee:01' ],
		[ '/usr/bin/etherwake', '-i', 'eth1', '-b', '-p', 'aa:bb:cc:dd:ee:ff', 'aa:bb:cc:dd:ee:01' ],
	]);
});

test('wake: bad input, unknown or non-Ethernet interface, missing program, failure', () => {
	let spawned = [];
	let c = ctx('root', spawned);

	eq(wake(c, { mac: 'nope', interface: 'br-lan' }), 2);
	eq(wake(c, { mac: 'aabbccddee01', interface: 'br-lan; reboot' }), 2);
	eq(wake(c, { mac: 'aabbccddee01', interface: 'br-lan', password: 'xyz' }), 2);
	eq(wake(c, { mac: 'aabbccddee01' }), 2);
	eq(wake(c, { mac: 'aabbccddee01', interface: 'wg0' }), 4);
	eq(wake(c, { mac: 'aabbccddee01', interface: 'lo' }), 4);
	eq(wake(c, { mac: 'aabbccddee01', interface: 'eth9' }), 4);
	eq(spawned, []);
	eq(wake(ctx('root', [], 1), { mac: 'aabbccddee01', interface: 'br-lan' }), 9);
});

done();
