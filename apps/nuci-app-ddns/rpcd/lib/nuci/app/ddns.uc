// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-ddns: provider list (ddns-scripts' service definitions) and the
// runtime state ddns-scripts keeps in /var/run/ddns and /var/log/ddns.

'use strict';

import { readfile, lsdir } from 'fs';
import { STATUS } from 'nuci.rpc';
import { context, read_trim } from 'nuci.util';
import { start, status as job_status } from 'nuci.job';

const SECTION_RE = /^[A-Za-z0-9_]{1,64}$/;
const DEFS = [ '/usr/share/ddns/default', '/usr/share/ddns/custom' ];
const RUN = '/var/run/ddns', LOG = '/var/log/ddns';
const LOG_MAX = 32 * 1024;

function providers(ctx) {
	let c = context(ctx), out = {};
	for (let dir in DEFS) {
		for (let f in lsdir(c.root + dir) ?? []) {
			if (!match(f, /\.json$/)) continue;
			let d = json(readfile(`${c.root}${dir}/${f}`) ?? 'null');
			if (type(d?.name) != 'string') continue;
			out[d.name] = { name: d.name, ipv4: !!d.ipv4, ipv6: !!d.ipv6 };
		}
	}
	return { providers: map(sort(keys(out)), (k) => out[k]) };
}

function uptime(c) {
	let s = read_trim(c, '/proc/uptime');
	return s ? int(+split(s, ' ')[0]) : null;
}

/** ddns-scripts stores uptime seconds; convert to wall-clock epoch. */
function to_epoch(c, now, up, file) {
	let v = read_trim(c, file);
	return (v != null && match(v, /^[0-9]+$/) && up != null) ? now - (up - +v) : null;
}

function service_status(c, name, now, up) {
	let pid = read_trim(c, `${RUN}/${name}.pid`);
	let running = pid != null && match(pid, /^[0-9]+$/) && read_trim(c, `/proc/${pid}/stat`) != null;
	return {
		running: !!running,
		registered_ip: read_trim(c, `${RUN}/${name}.ip`),
		last_update: to_epoch(c, now, up, `${RUN}/${name}.update`),
		next_check: to_epoch(c, now, up, `${RUN}/${name}.nextcheck`),
	};
}

function status(ctx) {
	let c = context(ctx), now = time(), up = uptime(c), out = {};
	c.uci?.foreach('ddns', 'service', (s) => {
		if (match(s['.name'], SECTION_RE))
			out[s['.name']] = service_status(c, s['.name'], now, up);
	});
	return { services: out };
}

function log(ctx, section) {
	if (type(section) != 'string' || !match(section, SECTION_RE)) return STATUS.INVALID_ARGUMENT;
	let c = context(ctx);
	let text = readfile(`${c.root}${LOG}/${section}.log`) ?? '';
	if (length(text) > LOG_MAX) text = substr(text, length(text) - LOG_MAX);
	return { text };
}

/**
 * Check and update now: restart the ddns services (the init script starts
 * one updater daemon per enabled section; each checks immediately). The
 * updater itself never exits, so it cannot run as a tracked job.
 */
function update(ctx) {
	let c = context(ctx);
	return start(c, 'ddns-update', [ '/etc/init.d/ddns', 'restart' ]);
}

function update_status(ctx) {
	return job_status(ctx, 'ddns-update');
}

export { providers, status, log, update, update_status, SECTION_RE };
