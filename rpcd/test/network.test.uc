// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, here, done } from 'harness';
import { ubus_stub } from 'stubs';
import { process_started, protocols, restart } from 'nuci.network';

const fixtures = here() + '/fixtures/network';
const netifd = ubus_stub({ 'service.list': { network: { instances: { instance1: { running: true, pid: 2211 } } } } });

test('process_started: btime plus starttime ticks (recorded /proc/<netifd>/stat)', () => {
	eq(process_started({ root: fixtures + '/root' }, 2211), 1013);
	eq(process_started({ root: fixtures + '/root' }, 1), null);
});

test('protocols: a handler installed after netifd started is pending', () => {
	let p = protocols({ root: fixtures + '/root', ubus: netifd });

	eq(p.pending, [ 'ipip' ]);
	eq(p.started, 1013);
	eq(p.job, { name: 'network-restart', running: false });
});

test('protocols: nothing pending once netifd started later, or when it is down', () => {
	eq(protocols({ root: fixtures + '/old', ubus: netifd }).pending, []);
	eq(protocols({ root: fixtures + '/root', ubus: ubus_stub({}) }), { pending: [], started: null, job: { name: 'network-restart', running: false } });
});

test('restart runs the init script as a detached job', () => {
	let spawned = [];

	restart({ root: '/nonexistent', spawn: (argv) => { push(spawned, argv); return 0; } });
	eq(spawned, [ [ '/usr/libexec/nuci/run-job', 'network-restart', '/bin/sh', '-c', 'sleep 1; exec /etc/init.d/network restart' ] ]);
});

done();
