// SPDX-License-Identifier: Apache-2.0
'use strict';

import { readfile } from 'fs';
import { test, eq, here, done } from 'harness';
import { uci_stub, ubus_stub } from 'stubs';
import { rows, periods, data } from 'nuci.app.nlbwmon';

const fixtures = here() + '/../../apps/nuci-app-nlbwmon/rpcd/test/fixtures';
const NLBW = '/usr/sbin/nlbw';
// Recorded on the 25.12.0 armsr lab (`nlbw -c json -g mac,ip,layer7`), plus an IPv6 row.
const JSON_OUT = readfile(fixtures + '/nlbw-mac-ip-layer7.json');

function ctx(outputs, ran) {
	return {
		root: fixtures + '/root',
		run: (argv) => { push(ran ?? [], argv); return outputs[join(' ', argv)]; },
		uci: uci_stub({ dhcp: { pc: { '.type': 'host', name: 'lab-host', mac: '52:55:C0:A8:01:02' } } }),
		ubus: ubus_stub({ 'service.list': { nlbwmon: { instances: { instance1: { running: true } } } } }),
	};
}

test('rows: nlbw JSON columns become objects', () => {
	eq(rows('{"columns":["mac","conns"],"data":[["aa",1]]}'), [ { mac: 'aa', conns: 1 } ]);
	eq(rows('Error while processing command: No data available'), null);
	eq(rows(null), null);
});

test('data: clients by MAC with host names, protocols across clients', () => {
	let ran = [];
	let d = data(ctx({ [`${NLBW} -c json -g mac,ip,layer7`]: JSON_OUT }, ran));

	eq(ran, [ [ NLBW, '-c', 'json', '-g', 'mac,ip,layer7' ] ]);
	eq(d.period, null);
	eq(d.running, true);
	eq(map(d.clients, c => c.mac), [ '52:54:00:12:34:57', '52:55:c0:a8:01:02' ]);

	let host = d.clients[1];
	eq(host.hostname, 'lab-host');
	eq(host.ips, [ '192.168.1.2', 'fd00::2' ]);
	eq([ host.conns, host.rx_bytes, host.tx_bytes ], [ 5, 2148, 740043 ]);
	eq(map(host.protocols, p => p.name), [ 'HTTP', 'IP', 'UDP/5353' ]);

	eq(map(d.protocols, p => [ p.name, p.clients ]), [ [ 'HTTPS', 1 ], [ 'HTTP', 1 ], [ 'IP', 2 ], [ 'UDP/5353', 1 ] ]);
	eq(d.protocols[2].tx_bytes, 6344);
});

test('data: a past period by its start date; anything else is rejected', () => {
	let ran = [];
	let d = data(ctx({}, ran), '2026-09-01');

	eq(ran[0], [ NLBW, '-c', 'json', '-g', 'mac,ip,layer7', '-t', '2026-09-01' ]);
	eq([ d.period, d.clients, d.protocols ], [ '2026-09-01', [], [] ]);
	eq(data(ctx({}), '2026-09-01; reboot'), 2);
	eq(data(ctx({}), '-c commit'), 2);
});

test('periods: newest first, junk dropped', () => {
	let p = periods(ctx({ [`${NLBW} -c list`]: '2026-09-01\n2026-10-01\nnot a date\n' }));

	eq(p, { running: true, periods: [ '2026-10-01', '2026-09-01' ] });
});

test('a client with many protocols keeps the biggest, the rest summed up', () => {
	let data_rows = [];

	for (let i = 1; i <= 10; i++)
		push(data_rows, [ 'TCP', 1000 + i, 'aa:bb:cc:dd:ee:ff', '192.168.1.9', 1, i * 100, 1, 0, 0, null ]);

	let d = data(ctx({ [`${NLBW} -c json -g mac,ip,layer7`]: sprintf('%J', { columns: [ 'proto', 'port', 'mac', 'ip', 'conns', 'rx_bytes', 'rx_pkts', 'tx_bytes', 'tx_pkts', 'layer7' ], data: data_rows }) }));
	let p = d.clients[0].protocols;

	eq(length(p), 9);
	eq(p[0].name, 'TCP/1010');
	eq(p[8], { name: null, conns: 2, rx_bytes: 300, rx_pkts: 2, tx_bytes: 0, tx_pkts: 0 });
});

done();
