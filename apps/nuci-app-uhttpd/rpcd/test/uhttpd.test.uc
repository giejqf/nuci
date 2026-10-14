// SPDX-License-Identifier: Apache-2.0
'use strict';

import { readfile } from 'fs';
import { test, eq, here, done } from 'harness';
import { uci_stub, ubus_stub } from 'stubs';
import { parse_cert, status, regenerate } from 'nuci.app.uhttpd';
import { RUNNER } from 'nuci.job';

const fixtures = here() + '/../../apps/nuci-app-uhttpd/rpcd/test/fixtures';
// Made by px5g on the 25.12.0 armsr lab (DER, EC P-256), and with openssl (PEM, RSA 2048).
const DER = readfile(fixtures + '/root/etc/uhttpd.crt');
const PEM = readfile(fixtures + '/rsa-2048.pem');
const SERVICE = json(readfile(fixtures + '/service-list.json'));

function ctx(root, main, spawned) {
	return {
		root: fixtures + '/' + root,
		ubus: ubus_stub({ 'service.list': SERVICE }),
		uci: uci_stub({ uhttpd: { main: { '.type': 'uhttpd', ...main } } }),
		spawn: (argv) => { push(spawned ?? [], argv); return 0; },
	};
}

test('parse_cert: px5g DER certificate', () => {
	let c = parse_cert(DER);

	eq(c.format, 'der');
	eq(c.subject, 'C=ZZ, ST=Somewhere, L=Unknown, O=OpenWrtd293399e, CN=OpenWrt');
	eq(c.self_signed, true);
	eq(c.serial, '92ca25149a7d9996');
	eq([ c.not_before, c.not_after ], [ 1791940582, 1826241382 ]);
	eq(c.key, 'EC P-256');
});

test('parse_cert: PEM with an RSA key; junk is rejected', () => {
	let c = parse_cert(PEM);

	eq([ c.format, c.subject, c.serial, c.key ], [ 'pem', 'C=DE, O=NuCI Test, CN=router.example', '0123456789abcdef', 'RSA 2048' ]);
	eq(c.self_signed, true);
	eq(parse_cert('-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----'), null);
	eq(parse_cert('not a certificate'), null);
	eq(parse_cert(''), null);
	eq(parse_cert(substr(DER, 0, 100)), null);
});

test('status: listeners from the running command line, certificate, generator', () => {
	let s = status(ctx('root', {}));

	eq(s.running, true);
	eq(s.instances[0].http, [ '0.0.0.0:80', '[::]:80' ]);
	eq(s.instances[0].https, [ '0.0.0.0:443', '[::]:443' ]);
	eq([ s.cert.path, s.cert.key, s.generator ], [ '/etc/uhttpd.crt', 'EC P-256', 'px5g' ]);

	s = status(ctx('empty', { cert: '/etc/missing.crt' }));
	eq([ s.cert, s.generator ], [ { path: '/etc/missing.crt', missing: true }, null ]);
	eq(status(ctx('root', { cert: '/etc/../tmp/x' })).cert, null);
});

test('regenerate: paths as arguments, only with a generator', () => {
	let spawned = [];

	regenerate(ctx('root', { cert: '/etc/my.crt' }, spawned));
	eq(spawned, [ [ RUNNER, 'uhttpd', '/bin/sh', '-c', 'sleep 1; rm -f "$1" "$2"; exec "$0" restart',
		'/etc/init.d/uhttpd', '/etc/my.crt', '/etc/uhttpd.key' ] ]);
	eq(regenerate(ctx('root', { key: '/etc/k; reboot' }, spawned)), 8);
	eq(regenerate(ctx('empty', {}, spawned)), 8);
	eq(length(spawned), 1);
});

done();
