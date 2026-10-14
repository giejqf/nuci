// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-frpc: state of the frp client (procd), its proxies as reported
// by frpc's local admin API, its recent log, and the service actions as a
// detached job.

'use strict';

import { glob } from 'fs';
import { context, lines } from 'nuci.util';
import { start, status as job_status } from 'nuci.job';
import { STATUS } from 'nuci.rpc';

const NAME = 'frpc';
const INIT = '/etc/init.d/frpc';
const ACTIONS = {
	start: [ INIT, 'start' ],
	stop: [ INIT, 'stop' ],
	restart: [ INIT, 'restart' ],
	enable: [ '/bin/sh', '-c', `${INIT} enable && ${INIT} start` ],
	disable: [ '/bin/sh', '-c', `${INIT} stop; ${INIT} disable` ],
};
const LOG_LINES = 40;
const IPV4_RE = /^[0-9]{1,3}(\.[0-9]{1,3}){3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

function parse_json(text) {
	try {
		return text ? json(text) : null;
	}
	catch (e) {
		return null;
	}
}

// Where to reach the admin API: wildcard and empty addresses mean loopback.
function admin_url(c) {
	let port = c.uci?.get('frpc', 'common', 'admin_port');

	if (!match(`${port ?? ''}`, /^[0-9]{1,5}$/) || +port < 1 || +port > 65535)
		return null;

	let addr = c.uci?.get('frpc', 'common', 'admin_addr') ?? '';

	if (addr == '' || addr == '0.0.0.0' || addr == '::' || addr == 'localhost')
		addr = '127.0.0.1';
	else if (!match(addr, IPV4_RE) && !match(addr, IPV6_RE))
		return null;

	return `http://${index(addr, ':') >= 0 ? `[${addr}]` : addr}:${port}/api/status`;
}

// {"tcp":[{name,type,status,err,local_addr,remote_addr,plugin}], "udp":[...]}
function parse_proxies(text) {
	let doc = parse_json(text);

	if (type(doc) != 'object')
		return null;

	let out = [];

	for (let t, list in doc)
		for (let p in (type(list) == 'array') ? list : [])
			if (type(p) == 'object')
				push(out, {
					name: p.name ?? '',
					type: p.type ?? t,
					status: p.status ?? '',
					error: p.err ?? '',
					local_addr: p.local_addr ?? '',
					remote_addr: p.remote_addr ?? '',
				});

	return sort(out, (a, b) => (a.name < b.name) ? -1 : (a.name > b.name) ? 1 : 0);
}

// logread lines: "<date> daemon.info frpc[pid]: \e[1;34m2026-10-14 00:56:04.249 [I] [file.go:172] text"
function parse_log(text) {
	let out = [];

	for (let l in lines(text)) {
		let i = index(l, ']: ');

		if (i < 0)
			continue;

		let msg = trim(replace(substr(l, i + 3), /\x1b\[[0-9;]*m/g, ''));
		let m = match(msg, /^([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:]{8})(\.[0-9]+)? \[([A-Z])\] \[[^\]]*\] (.*)$/);

		if (m)
			push(out, { time: m[1], level: m[3], text: m[4] });
		else if (length(msg))
			push(out, { time: null, level: null, text: msg });
	}

	return slice(out, -LOG_LINES);
}

function status(ctx) {
	let c = context(ctx);

	let svc = c.ubus?.call('service', 'list', { name: NAME })?.[NAME];
	let running = false;

	for (let n, inst in svc?.instances ?? {})
		if (inst.running)
			running = true;

	let url = admin_url(c);
	let proxies = null;

	if (running && url) {
		let argv = [ '/bin/uclient-fetch', '-q', '-T', '3', '-O', '-' ];
		let user = c.uci?.get('frpc', 'common', 'admin_user');
		let pwd = c.uci?.get('frpc', 'common', 'admin_pwd');

		if (type(user) == 'string' && length(user))
			push(argv, `--user=${user}`, `--password=${pwd ?? ''}`);

		push(argv, url);
		proxies = parse_proxies(c.run(argv));
	}

	return {
		enabled: length(glob(`${c.root}/etc/rc.d/S*${NAME}`) ?? []) > 0,
		running,
		// null: no admin API configured (or not answering), so no proxy states
		admin: url != null,
		proxies,
		log: parse_log(c.run([ '/sbin/logread', '-l', '200', '-e', NAME ])),
		job: job_status(c, NAME),
	};
}

function service(ctx, action) {
	ctx = context(ctx);

	let argv = ACTIONS[action];

	if (type(action) != 'string' || !argv)
		return STATUS.INVALID_ARGUMENT;

	return start(ctx, NAME, argv);
}

export { admin_url, parse_proxies, parse_log, status, service };
