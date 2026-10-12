// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, done } from 'harness';
import { uci_stub } from 'stubs';
import { status } from 'nuci.app.sqm';

const EGRESS = 'qdisc cake 8005: root refcnt 2 bandwidth 10Mbit besteffort triple-isolate nat nowash\n Sent 258 bytes 2 pkt (dropped 1, overlimits 0 requeues 0) \n backlog 0b 0p requeues 0\nqdisc fq_codel 0: parent 8005:1 limit 10240p\n Sent 0 bytes 0 pkt (dropped 0, overlimits 0 requeues 0) \n';
const INGRESS = 'qdisc cake 8006: root refcnt 2 bandwidth 85Mbit besteffort\n Sent 1000 bytes 10 pkt (dropped 0, overlimits 0 requeues 0) \n';

test('status: root qdiscs per managed interface, unsafe names skipped', () => {
	let ran = [];
	let run = (argv) => (push(ran, argv), argv[5] == 'eth1' ? EGRESS : argv[5] == 'ifb4eth1' ? INGRESS : '');
	let s = status({
		run,
		uci: uci_stub({ sqm: { eth1: { '.type': 'queue', interface: 'eth1' }, bad: { '.type': 'queue', interface: 'eth1;reboot' } } }),
	});
	eq(s.interfaces.eth1.egress, [ { kind: 'cake', handle: '8005:', root: true, bandwidth: '10Mbit', sent_bytes: 258, sent_packets: 2, dropped: 1 } ]);
	eq(s.interfaces.eth1.ingress[0].bandwidth, '85Mbit');
	eq(length(keys(s.interfaces)), 1);
	eq(ran, [ [ 'tc', '-s', 'qdisc', 'show', 'dev', 'eth1' ], [ 'tc', '-s', 'qdisc', 'show', 'dev', 'ifb4eth1' ] ]);
});

done();
