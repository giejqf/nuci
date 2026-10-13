// SPDX-License-Identifier: Apache-2.0
//
// netifd loads protocol handlers (/lib/netifd/proto/*.sh) only when it
// starts. A handler installed later is unknown until the network service
// restarts: find those (installed = ctime after netifd's start; apk keeps
// the package's mtime) and restart the service as a detached job.

'use strict';

import { stat } from 'fs';
import { context, read, list } from 'nuci.util';
import { start, status as job_status } from 'nuci.job';

const PROTO_DIR = '/lib/netifd/proto';
// USER_HZ: /proc/<pid>/stat counts in 1/100 s on every Linux architecture.
const TICKS = 100;

// Epoch seconds at which process `pid` started, from /proc.
function process_started(ctx, pid) {
	let st = read(ctx, `/proc/${pid}/stat`);
	let btime = match(read(ctx, '/proc/stat') ?? '', /\nbtime ([0-9]+)/);

	if (!st || !btime)
		return null;

	// Field 22 (starttime), counted after the parenthesized command name.
	let f = split(trim(substr(st, rindex(st, ')') + 1)), ' ');

	return match(f[19] ?? '', /^[0-9]+$/) ? +btime[1] + int(+f[19] / TICKS) : null;
}

function netifd_started(ctx) {
	let svc = ctx.ubus?.call('service', 'list', { name: 'network' })?.network;

	for (let n, inst in svc?.instances ?? {})
		if (inst.running && inst.pid)
			return process_started(ctx, inst.pid);

	return null;
}

// Protocol scripts installed after netifd started: { pending: [names], started, job }.
function protocols(ctx) {
	ctx = context(ctx);

	let started = netifd_started(ctx);
	let pending = [];

	if (started != null) {
		for (let f in list(ctx, PROTO_DIR)) {
			let m = match(f, /^([A-Za-z0-9_-]+)\.sh$/);
			let s = m ? stat(`${ctx.root}${PROTO_DIR}/${f}`) : null;

			if (s && s.ctime > started)
				push(pending, m[1]);
		}
	}

	return { pending, started, job: job_status(ctx, 'network-restart') };
}

// Restart netifd (all interfaces go down and up). The short delay lets the
// reply reach the browser before the LAN goes away.
function restart(ctx) {
	ctx = context(ctx);

	return start(ctx, 'network-restart', [ '/bin/sh', '-c', 'sleep 1; exec /etc/init.d/network restart' ]);
}

export { process_started, protocols, restart };
