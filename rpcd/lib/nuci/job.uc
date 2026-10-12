// SPDX-License-Identifier: Apache-2.0
//
// Detached jobs (apk, sysupgrade -b/-r): started through
// /usr/libexec/nuci/run-job, state in /tmp/nuci-jobs/<name>/.

'use strict';

import { context, read_int, read_trim, read } from 'nuci.util';

const RUNNER = '/usr/libexec/nuci/run-job';
const JOBS = '/tmp/nuci-jobs';
const LOG_TAIL = 8192;

function status(ctx, name) {
	ctx = context(ctx);

	let dir = `${JOBS}/${name}`;
	let pid = read_int(ctx, `${dir}/pid`);
	let running = pid != null && read(ctx, `/proc/${pid}/stat`) != null;
	let out = { name, running };
	let cmd = read_trim(ctx, `${dir}/cmd`);

	if (cmd == null)
		return out;

	out.command = cmd;
	out.started = read_int(ctx, `${dir}/started`);

	let log = read(ctx, `${dir}/log`) ?? '';
	out.log = (length(log) > LOG_TAIL) ? substr(log, -LOG_TAIL) : log;

	if (!running) {
		out.finished = read_int(ctx, `${dir}/finished`);
		out.rc = read_int(ctx, `${dir}/rc`);
	}

	return out;
}

// Start `argv` as job `name`. Returns the job status, or a ubus status code:
// PERMISSION_DENIED (6) while a job of that name is still running.
function start(ctx, name, argv) {
	ctx = context(ctx);

	let rc = ctx.spawn([ RUNNER, name, ...argv ]);

	if (rc == 16)
		return 6; // busy: another job of this kind is running -> PERMISSION_DENIED

	if (rc != 0)
		return 9; // UNKNOWN_ERROR

	return status(ctx, name);
}

export { status, start, RUNNER, JOBS };
