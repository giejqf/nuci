// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, ok, here, done } from 'harness';
import { uci_stub } from 'stubs';
import { providers, status, log, update } from 'nuci.app.ddns';

const near = (a, b) => (a > b ? a - b : b - a) <= 2;
const root = here() + '/../../apps/nuci-app-ddns/rpcd/test/fixtures/root';
const uci = uci_stub({ ddns: { global: { '.type': 'ddns' }, home: { '.type': 'service' }, idle: { '.type': 'service' } } });

test('providers come from ddns-scripts definitions, sorted, with families', () => {
	eq(providers({ root }).providers, [
		{ name: 'duckdns.org', ipv4: true, ipv6: true },
		{ name: 'dyndns.org', ipv4: true, ipv6: false },
	]);
});

test('status converts uptime stamps and checks the updater pid', () => {
	let s = status({ root, uci }).services;
	let now = time();
	eq(s.home.running, true);
	eq(s.home.registered_ip, '10.0.2.15');
	ok(near(s.home.last_update, now - 300), 'last update 300 s ago');
	ok(near(s.home.next_check, now + 300), 'next check in 300 s');
	eq(s.idle, { running: false, registered_ip: null, last_update: null, next_check: null });
});

test('log reads a valid section only', () => {
	eq(log({ root }, 'home').text, ' 083839  info : Update successful\n');
	eq(log({ root }, '../../etc/shadow'), 2);
});

test('update restarts the ddns services as a detached job', () => {
	let spawned = [];
	update({ root, spawn: (argv) => (push(spawned, argv), 0) });
	eq(spawned[0][1], 'ddns-update');
	eq(slice(spawned[0], 2), [ '/etc/init.d/ddns', 'restart' ]);
});

done();
