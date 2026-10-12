// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, ok, done } from 'harness';
import { ping, traceroute, nslookup, valid_host } from 'nuci.diag';

function ctx(spawned) {
	return { root: '/nonexistent', spawn: (argv) => (push(spawned, argv), 0) };
}

test('valid_host accepts names and addresses, rejects options and junk', () => {
	for (let h in [ 'openwrt.org', '192.168.1.1', 'fe80::1', '::1', 'a-b.example' ])
		ok(valid_host(h), h);
	for (let h in [ '-c1', 'a b', 'x;reboot', '$(id)', '', null ])
		ok(!valid_host(h), `${h}`);
});

test('commands are bounded argv arrays', () => {
	let s = [];
	ping(ctx(s), 'openwrt.org', 3, 6);
	ping(ctx(s), '1.1.1.1', 999);
	traceroute(ctx(s), 'openwrt.org', 4);
	nslookup(ctx(s), 'openwrt.org', '1.1.1.1');
	nslookup(ctx(s), 'openwrt.org');
	eq(s, [
		[ '/usr/libexec/nuci/run-job', 'diag', 'ping', '-c', '3', '-W', '2', '-6', 'openwrt.org' ],
		[ '/usr/libexec/nuci/run-job', 'diag', 'ping', '-c', '4', '-W', '2', '1.1.1.1' ],
		[ '/usr/libexec/nuci/run-job', 'diag', 'traceroute', '-m', '20', '-w', '2', '-q', '1', '-4', 'openwrt.org' ],
		[ '/usr/libexec/nuci/run-job', 'diag', 'nslookup', 'openwrt.org', '1.1.1.1' ],
		[ '/usr/libexec/nuci/run-job', 'diag', 'nslookup', 'openwrt.org' ],
	]);
	eq(ping(ctx(s), '-f', 1), 2);
	eq(nslookup(ctx(s), 'x.org', 'evil.server'), 2);
	eq(length(s), 5);
});

done();
