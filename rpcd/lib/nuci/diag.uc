// SPDX-License-Identifier: Apache-2.0
//
// Network diagnostics (ping, traceroute, nslookup) as the bounded detached
// job "diag"; output is polled with status().

'use strict';

import { start, status as job_status } from 'nuci.job';

const HOST_RE = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,252})$/;
const IP_RE = /^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[0-9A-Fa-f:]*:[0-9A-Fa-f:.]*$/;

function valid_host(h) {
	return type(h) == 'string' && (match(h, HOST_RE) != null || match(h, IP_RE) != null) &&
		substr(h, 0, 1) != '-';
}

function family_flag(f) {
	return (f == 4) ? [ '-4' ] : (f == 6) ? [ '-6' ] : [];
}

// Returns the job status or a ubus status code.
function ping(ctx, host, count, family) {
	if (!valid_host(host))
		return 2;

	count = (type(count) == 'int' && count >= 1 && count <= 10) ? count : 4;

	return start(ctx, 'diag', [ 'ping', '-c', `${count}`, '-W', '2', ...family_flag(family), host ]);
}

function traceroute(ctx, host, family) {
	if (!valid_host(host))
		return 2;

	return start(ctx, 'diag', [ 'traceroute', '-m', '20', '-w', '2', '-q', '1', ...family_flag(family), host ]);
}

function nslookup(ctx, host, server) {
	if (!valid_host(host) || (server != null && server != '' && !match(server, IP_RE)))
		return 2;

	return start(ctx, 'diag', [ 'nslookup', host, ...((server != null && server != '') ? [ server ] : []) ]);
}

function status(ctx) {
	return job_status(ctx, 'diag');
}

export { valid_host, ping, traceroute, nslookup, status };
