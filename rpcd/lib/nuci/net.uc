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

function strip_prefix(cidr) {
	return lc(split(cidr, '/')[0]);
}

function as_list(v) {
	return (type(v) == 'array') ? v : (v == null) ? [] : split(trim(v), /\s+/);
}

// Whether the committed configuration still plans this address. After
// `uci apply` the config already describes the new state while netifd may
// take seconds to reload, so a static interface that no longer lists the
// address means "going away" right now. Addresses not set literally in uci
// (DHCP, SLAAC, ip6assign) are left to address_present().
function address_planned(ctx, server_addr) {
	ctx = context(ctx);

	let a = normalize_addr(server_addr);
	let holder = null;

	for (let i in ctx.ubus?.call('network.interface', 'dump', {})?.interface ?? []) {
		let live = map([ ...(i['ipv4-address'] ?? []), ...(i['ipv6-address'] ?? []) ], x => lc(x.address));

		if (a in live) {
			holder = i;
			break;
		}
	}

	if (!holder || holder.proto != 'static')
		return true;

	let sec = holder.interface;
	let proto = ctx.uci?.get('network', sec, 'proto');

	if (proto != 'static' || ctx.uci.get('network', sec, 'disabled') == '1' || ctx.uci.get('network', sec, 'auto') == '0')
		return false;

	if (index(a, ':') >= 0) {
		let v6 = map(as_list(ctx.uci.get('network', sec, 'ip6addr')), strip_prefix);

		// Literal ip6addr entries are checked; derived ones (ip6assign) are not.
		return !length(v6) || (a in v6);
	}

	return a in map(as_list(ctx.uci.get('network', sec, 'ipaddr')), strip_prefix);
}

// Whether the committed uhttpd config still serves this connection (its
// local address and port, HTTP or HTTPS). Like address_planned(): after
// `uci apply` the config is already the new one while uhttpd restarts
// later, and a kept-alive connection may outlive a listener that is gone.
// Without a readable uhttpd config there is nothing to check.
function listener_planned(ctx, server_addr, server_port, tls) {
	ctx = context(ctx);

	let a = normalize_addr(server_addr);
	let v6 = index(a, ':') >= 0;
	let seen = false;
	let found = false;

	ctx.uci?.foreach('uhttpd', 'uhttpd', s => {
		seen = true;

		if (s.enabled == '0')
			return;

		for (let l in as_list(tls ? s.listen_https : s.listen_http)) {
			// "port", "addr:port" or "[v6addr]:port"
			let m = match(l, /^(\[([0-9A-Fa-f:.]+)\]:|([0-9.]+):)?([0-9]{1,5})$/);

			if (!m || m[4] != `${server_port}`)
				continue;

			let la = normalize_addr(m[2] ?? m[3]);

			if (la == '' || la == a || (la == '0.0.0.0' && !v6) || (la == '::' && v6))
				found = true;
		}
	});

	return !seen || found;
}

export { parse_ip_addr, local_addresses, normalize_addr, address_present, address_planned, listener_planned };
