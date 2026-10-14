// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-https-dns-proxy: state of the DNS-over-HTTPS proxy instances
// (procd), the dnsmasq servers pointing at them, and the service actions
// (start, stop, restart, enable, disable) as a detached job.

'use strict';

import { glob } from 'fs';
import { context } from 'nuci.util';
import { start, status as job_status } from 'nuci.job';
import { STATUS } from 'nuci.rpc';

const NAME = 'https-dns-proxy';
const INIT = '/etc/init.d/https-dns-proxy';
// Fixed command lines: the action only selects one.
const ACTIONS = {
	start: [ INIT, 'start' ],
	stop: [ INIT, 'stop' ],
	restart: [ INIT, 'restart' ],
	enable: [ '/bin/sh', '-c', `${INIT} enable && ${INIT} start` ],
	disable: [ '/bin/sh', '-c', `${INIT} stop; ${INIT} disable` ],
};

// The value after a switch in the command line (https-dns-proxy -r URL -p PORT ...).
function arg(cmd, sw) {
	let i = index(cmd ?? [], sw);

	return (i >= 0 && i + 1 < length(cmd)) ? cmd[i + 1] : null;
}

function instances(svc) {
	let out = [];

	for (let name, inst in svc?.instances ?? {}) {
		let cmd = inst.command ?? [];
		let port = arg(cmd, '-p');

		push(out, {
			name,
			running: !!inst.running,
			pid: inst.pid ?? null,
			resolver: arg(cmd, '-r'),
			listen_addr: arg(cmd, '-a') ?? '127.0.0.1',
			listen_port: port ? +port : null,
			bootstrap: arg(cmd, '-b'),
			// The instance carrying the redirect/reject rules for "force DNS".
			force_dns: length(inst.data?.firewall ?? []) > 0,
		});
	}

	return sort(out, (a, b) => (a.listen_port ?? 0) - (b.listen_port ?? 0));
}

function as_list(v) {
	return (type(v) == 'array') ? v : (v != null && v != '') ? [ v ] : [];
}

function status(ctx) {
	ctx = context(ctx);

	let svc = ctx.ubus?.call('service', 'list', { name: NAME })?.[NAME];
	let list = instances(svc);
	let dnsmasq = [];

	ctx.uci?.foreach('dhcp', 'dnsmasq', s => {
		push(dnsmasq, {
			section: s['.name'],
			// doh_server: what the proxy added to "server" (and removes on stop).
			doh_servers: as_list(s.doh_server),
			noresolv: s.noresolv == '1',
		});
	});

	return {
		enabled: length(glob(`${ctx.root}/etc/rc.d/S*${NAME}`) ?? []) > 0,
		running: length(filter(list, i => i.running)) > 0,
		instances: list,
		force_dns: length(filter(list, i => i.force_dns)) > 0,
		dnsmasq,
		job: job_status(ctx, NAME),
	};
}

function service(ctx, action) {
	ctx = context(ctx);

	let argv = ACTIONS[action];

	if (type(action) != 'string' || !argv)
		return STATUS.INVALID_ARGUMENT;

	return start(ctx, NAME, argv);
}

export { instances, status, service };
