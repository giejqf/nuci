// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-upnp: miniupnpd state (procd) and the active port mappings from its
// lease file ("PROTO:EXTPORT:CLIENT:INTPORT:EXPIRES:DESCRIPTION" per line).

'use strict';

import { readfile } from 'fs';
import { context } from 'nuci.util';

const DEFAULT_LEASES = '/var/run/miniupnpd.leases';

function parse_leases(text) {
	let out = [];
	for (let line in split(text ?? '', '\n')) {
		let f = split(line, ':', 6);
		if (length(f) < 5 || !match(f[1], /^[0-9]+$/) || !match(f[3], /^[0-9]+$/)) continue;
		push(out, {
			proto: f[0],
			external_port: +f[1],
			client: f[2],
			internal_port: +f[3],
			expires: match(f[4], /^[0-9]+$/) ? +f[4] : null,
			description: f[5] ?? '',
		});
	}
	return out;
}

function lease_file(c) {
	let p = c.uci?.get('upnpd', 'config', 'upnp_lease_file');
	// Only the runtime locations miniupnpd uses; never an arbitrary path.
	return (type(p) == 'string' && match(p, /^\/(var\/run|tmp)\/[A-Za-z0-9._-]+$/)) ? p : DEFAULT_LEASES;
}

function status(ctx) {
	let c = context(ctx);
	let svc = c.ubus?.call('service', 'list', { name: 'miniupnpd' })?.miniupnpd;
	let running = false;
	for (let n, inst in svc?.instances ?? {})
		if (inst.running) running = true;
	return {
		running,
		redirects: parse_leases(readfile(c.root + lease_file(c))),
	};
}

export { parse_leases, status };
