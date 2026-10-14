// SPDX-License-Identifier: Apache-2.0
'use strict';

import { readfile } from 'fs';
import { test, eq, here, done } from 'harness';
import { uci_stub, ubus_stub } from 'stubs';
import { status, service } from 'nuci.app.https_dns_proxy';
import { RUNNER } from 'nuci.job';

const fixtures = here() + '/../../apps/nuci-app-https-dns-proxy/rpcd/test/fixtures';
// Recorded on the 25.12.0 armsr lab with the package's default config.
const SERVICE = json(readfile(fixtures + '/service-list.json'));

function ctx(root, replies, spawned) {
	return {
		root: fixtures + '/' + root,
		ubus: ubus_stub(replies),
		uci: uci_stub({ dhcp: {
			cfg01411c: {
				'.type': 'dnsmasq', noresolv: '1',
				server: [ '/mask.icloud.com/', '127.0.0.1#5053', '127.0.0.1#5054' ],
				doh_server: [ '127.0.0.1#5053', '127.0.0.1#5054' ],
			},
			lan: { '.type': 'dhcp' },
		} }),
		spawn: (argv) => { push(spawned ?? [], argv); return 0; },
	};
}

test('status: instances from the procd command lines, dnsmasq servers, boot state', () => {
	let s = status(ctx('root', { 'service.list': SERVICE }));

	eq(s.enabled, true);
	eq(s.running, true);
	eq(s.force_dns, true);
	eq(map(s.instances, i => [ i.resolver, i.listen_addr, i.listen_port, i.force_dns ]), [
		[ 'https://cloudflare-dns.com/dns-query', '127.0.0.1', 5053, true ],
		[ 'https://dns.google/dns-query', '127.0.0.1', 5054, false ],
	]);
	eq(s.instances[0].bootstrap, '1.1.1.1,1.0.0.1,2606:4700:4700::1111,2606:4700:4700::1001');
	eq(s.dnsmasq, [ { section: 'cfg01411c', doh_servers: [ '127.0.0.1#5053', '127.0.0.1#5054' ], noresolv: true } ]);
	eq(s.job, { name: 'https-dns-proxy', running: false });
});

test('status: stopped and disabled', () => {
	let s = status(ctx('empty', { 'service.list': {} }));

	eq([ s.enabled, s.running, s.force_dns, s.instances ], [ false, false, false, [] ]);
});

test('service: fixed command lines per action, nothing else', () => {
	let spawned = [];
	let c = ctx('empty', {}, spawned);

	service(c, 'stop');
	service(c, 'enable');
	eq(spawned, [
		[ RUNNER, 'https-dns-proxy', '/etc/init.d/https-dns-proxy', 'stop' ],
		[ RUNNER, 'https-dns-proxy', '/bin/sh', '-c', '/etc/init.d/https-dns-proxy enable && /etc/init.d/https-dns-proxy start' ],
	]);
	eq(service(c, 'reboot'), 2);
	eq(service(c, 'toString'), 2);
	eq(service(c, null), 2);
	eq(length(spawned), 2);
});

done();
