// SPDX-License-Identifier: Apache-2.0
'use strict';

import { readfile } from 'fs';
import { test, eq, here, done } from 'harness';
import { uci_stub, ubus_stub } from 'stubs';
import { admin_url, parse_proxies, parse_log, status, service } from 'nuci.app.frpc';
import { RUNNER } from 'nuci.job';

const fixtures = here() + '/../../apps/nuci-app-frpc/rpcd/test/fixtures';
// Recorded on the 25.12.0 armsr lab (frpc 0.66 against an frps on the lab).
const SERVICE = json(readfile(fixtures + '/service-list.json'));
const API = readfile(fixtures + '/api-status.json');
const LOG = readfile(fixtures + '/logread.txt');
const FETCH = '/bin/uclient-fetch -q -T 3 -O -';

function ctx(root, common, outputs, ran, spawned) {
	return {
		root: fixtures + '/' + root,
		ubus: ubus_stub({ 'service.list': (root == 'root') ? SERVICE : {} }),
		uci: uci_stub({ frpc: { common: { '.type': 'conf', ...common } } }),
		run: (argv) => { push(ran ?? [], argv); return outputs?.[join(' ', argv)]; },
		spawn: (argv) => { push(spawned ?? [], argv); return 0; },
	};
}

test('admin_url: loopback for wildcard addresses, brackets for IPv6, nothing without a port', () => {
	eq(admin_url(ctx('root', { admin_port: '7400' })), 'http://127.0.0.1:7400/api/status');
	eq(admin_url(ctx('root', { admin_addr: '0.0.0.0', admin_port: '7400' })), 'http://127.0.0.1:7400/api/status');
	eq(admin_url(ctx('root', { admin_addr: '::1', admin_port: '7400' })), 'http://[::1]:7400/api/status');
	eq(admin_url(ctx('root', { admin_addr: '192.168.1.1', admin_port: '7400' })), 'http://192.168.1.1:7400/api/status');
	eq(admin_url(ctx('root', { admin_addr: 'evil;host', admin_port: '7400' })), null);
	eq(admin_url(ctx('root', { admin_port: '99999' })), null);
	eq(admin_url(ctx('root', {})), null);
});

test('parse_proxies: every type flattened, sorted by name', () => {
	eq(parse_proxies(API), [ {
		name: 'ssh', type: 'tcp', status: 'running', error: '',
		local_addr: '127.0.0.1:80', remote_addr: '127.0.0.1:6080',
	} ]);
	eq(map(parse_proxies('{"udp":[{"name":"b","status":"start error","err":"port unavailable"}],"tcp":[{"name":"a"}]}'),
		p => [ p.name, p.type, p.error ]), [ [ 'a', 'tcp', '' ], [ 'b', 'udp', 'port unavailable' ] ]);
	eq(parse_proxies('404 page not found'), null);
});

test('parse_log: syslog prefix and colours removed, frp time and level split out', () => {
	let l = parse_log(LOG);

	eq(l[1], { time: '2026-10-14 00:56:04', level: 'I', text: '[80a6e2ddeb0c9bb6] [ssh] start proxy success' });
	eq(parse_log('Wed Oct 14 00:55:59 2026 daemon.info frpc[1]: \u001b[0mlogin to the server failed: refused'),
		[ { time: null, level: null, text: 'login to the server failed: refused' } ]);
});

test('status: proxies through the admin API only while running and configured', () => {
	let ran = [];
	let s = status(ctx('root', { admin_addr: '127.0.0.1', admin_port: '7400', admin_user: 'admin', admin_pwd: 'pw' },
		{ [`${FETCH} --user=admin --password=pw http://127.0.0.1:7400/api/status`]: API, '/sbin/logread -l 200 -e frpc': LOG }, ran));

	eq([ s.enabled, s.running, s.admin ], [ true, true, true ]);
	eq(map(s.proxies, p => p.status), [ 'running' ]);
	eq(length(s.log), 6);
	eq(ran[0][0], '/bin/uclient-fetch');

	ran = [];
	s = status(ctx('empty', { admin_port: '7400' }, {}, ran));
	eq([ s.enabled, s.running, s.admin, s.proxies ], [ false, false, true, null ]);
	eq(map(ran, a => a[0]), [ '/sbin/logread' ]);

	s = status(ctx('root', {}, {}));
	eq([ s.admin, s.proxies ], [ false, null ]);
});

test('service: fixed command lines per action, nothing else', () => {
	let spawned = [];
	let c = ctx('empty', {}, {}, [], spawned);

	service(c, 'restart');
	eq(spawned, [ [ RUNNER, 'frpc', '/etc/init.d/frpc', 'restart' ] ]);
	eq(service(c, 'kill'), 2);
	eq(length(spawned), 1);
});

done();
