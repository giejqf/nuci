// SPDX-License-Identifier: Apache-2.0
//
// Local address helpers for the apply-protocol probe (ADR-0002).

'use strict';

import { context } from 'nuci.util';

// `ip -o addr show` -> [ "127.0.0.1", "::1", ... ] (prefix lengths dropped).
function parse_ip_addr(text) {
	let out = [];

	for (let m in match(text ?? '', /\binet6? ([0-9A-Fa-f.:]+)\//g) ?? [])
		push(out, lc(m[1]));

	return out;
}

function local_addresses(ctx) {
	ctx = context(ctx);

	return parse_ip_addr(ctx.run([ 'ip', '-o', 'addr', 'show' ]));
}

// Normalize uhttpd's SERVER_ADDR: strip brackets, zone ids, v4-mapped prefix.
function normalize_addr(addr) {
	addr = lc(replace(replace(addr ?? '', /^\[|\]$/g, ''), /%.*$/, ''));

	return replace(addr, /^::ffff:([0-9.]+)$/, '$1');
}

// Whether the address a connection arrived on is still assigned locally.
// An established keep-alive connection keeps working after its address was
// removed (TCP early demux), so reachability alone proves nothing.
function address_present(ctx, server_addr) {
	let a = normalize_addr(server_addr);

	return length(a) > 0 && (a in local_addresses(ctx));
}

export { parse_ip_addr, local_addresses, normalize_addr, address_present };
