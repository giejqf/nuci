// SPDX-License-Identifier: Apache-2.0
'use strict';

import { readfile } from 'fs';
import { test, eq, here, done } from 'harness';
import { uci_stub, ubus_stub } from 'stubs';
import { parse_status, status, rescan } from 'nuci.app.minidlna';
import { RUNNER } from 'nuci.job';

const fixtures = here() + '/../../apps/nuci-app-minidlna/rpcd/test/fixtures';
// Recorded on the 25.12.0 armsr lab (minidlna 1.3.3, one picture indexed).
const HTML = readfile(fixtures + '/status.html');
const SERVICE = json(readfile(fixtures + '/service-list.json'));
const CLIENT = '<tr><td>1</td><td>Samsung Series [CDE] TV</td><td>192.168.1.20</td><td>AA:BB:CC:DD:EE:01</td><td>2</td></tr>';

function ctx(config, outputs, ran, spawned) {
	return {
		root: fixtures + '/none',
		ubus: ubus_stub({ 'service.list': outputs ? SERVICE : {} }),
		uci: uci_stub({ minidlna: { config: { '.type': 'minidlna', ...config } } }),
		run: (argv) => { push(ran ?? [], argv); return outputs?.[join(' ', argv)]; },
		spawn: (argv) => { push(spawned ?? [], argv); return 0; },
	};
}

test('parse_status: counts and clients, without the status request itself', () => {
	eq(parse_status(HTML), { version: '1.3.3', audio: 0, video: 0, image: 1, clients: [] });
	eq(parse_status(replace(HTML, '</table><br>', CLIENT + '</table><br>')).clients,
		[ { type: 'Samsung Series [CDE] TV', ip: '192.168.1.20', mac: 'AA:BB:CC:DD:EE:01', connections: 2 } ]);
	eq(parse_status('<html>nginx</html>'), null);
	eq(parse_status(null), null);
});

test('status: the page on the configured port, only while running', () => {
	let ran = [];
	let s = status(ctx({ port: '8201' }, { '/bin/uclient-fetch -q -T 3 -O - http://127.0.0.1:8201/': HTML }, ran));

	eq([ s.running, s.port, s.library.image ], [ true, 8201, 1 ]);
	eq(length(ran), 1);

	ran = [];
	s = status(ctx({ port: 'x' }, null, ran));
	eq([ s.running, s.port, s.library, ran ], [ false, 8200, null, [] ]);
});

test('rescan: the database folder is an argument, and only a plain path', () => {
	let spawned = [];

	rescan(ctx({ db_dir: '/var/run/minidlna' }, null, [], spawned));
	eq(spawned, [ [ RUNNER, 'minidlna', '/bin/sh', '-c', '"$0" stop; rm -f "$1/files.db"; "$0" start',
		'/etc/init.d/minidlna', '/var/run/minidlna' ] ]);
	eq(rescan(ctx({ db_dir: '/tmp/../etc' }, null, [], spawned)), 8);
	eq(rescan(ctx({ db_dir: '/tmp/x; reboot' }, null, [], spawned)), 8);
	eq(rescan(ctx({ db_dir: '/' }, null, [], spawned)), 8);
	eq(length(spawned), 1);
	rescan(ctx({}, null, [], spawned));
	eq(spawned[1][6], '/var/run/minidlna');
});

done();
