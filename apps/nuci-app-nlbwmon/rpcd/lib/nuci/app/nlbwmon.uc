// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-nlbwmon: traffic per client and protocol from nlbwmon's database,
// read with its own client (`nlbw -c json`, `nlbw -c list`). Clients are
// grouped by MAC address and named from the DHCP/ARP view of nuci.dhcp.

'use strict';

import { context } from 'nuci.util';
import { hosts } from 'nuci.dhcp';

const NLBW = '/usr/sbin/nlbw';
const PERIOD_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
// Per-client protocol breakdown: the biggest few, the rest summed up.
const CLIENT_PROTOCOLS = 8;

// nlbw's JSON: { columns: [...], data: [[...], ...] } -> array of objects.
function rows(text) {
	let doc;

	try {
		doc = json(text ?? '');
	}
	catch (e) {
		return null;
	}

	if (type(doc?.columns) != 'array' || type(doc?.data) != 'array')
		return null;

	return map(doc.data, r => {
		let o = {};

		for (let i, c in doc.columns)
			o[c] = r[i];

		return o;
	});
}

function protocol_name(r) {
	if (r.layer7)
		return r.layer7;

	return (r.port > 0) ? `${r.proto}/${r.port}` : (r.proto ?? '?');
}

const COUNTERS = [ 'conns', 'rx_bytes', 'rx_pkts', 'tx_bytes', 'tx_pkts' ];

function add(to, r) {
	for (let k in COUNTERS)
		to[k] = (to[k] ?? 0) + (+r[k] || 0);

	return to;
}

const by_volume = (a, b) => (b.rx_bytes + b.tx_bytes) - (a.rx_bytes + a.tx_bytes);

// Aggregate `nlbw -g mac,ip,layer7` rows into clients and protocols.
function summarize(data, known) {
	let clients = {}, protocols = {};
	let names = {};

	for (let h in known ?? []) {
		if (h.hostname)
			names[h.macaddr] = h.hostname;
	}

	for (let r in data) {
		let mac = lc(r.mac ?? '');
		let name = protocol_name(r);
		let c = clients[mac] ??= { mac, hostname: names[mac], ips: [], by_proto: {} };

		if (r.ip && !(r.ip in c.ips))
			push(c.ips, r.ip);

		add(c, r);
		add(c.by_proto[name] ??= { name }, r);

		let p = protocols[name] ??= { name, macs: {} };

		add(p, r);
		p.macs[mac] = true;
	}

	let out_clients = map(values(clients), c => {
		let list = sort(values(c.by_proto), by_volume);
		let top = slice(list, 0, CLIENT_PROTOCOLS);

		if (length(list) > CLIENT_PROTOCOLS) {
			let rest = { name: null };

			for (let p in slice(list, CLIENT_PROTOCOLS))
				add(rest, p);

			push(top, rest);
		}

		delete c.by_proto;
		c.ips = sort(c.ips);
		c.protocols = top;

		return c;
	});

	let out_protocols = map(values(protocols), p => {
		p.clients = length(keys(p.macs));
		delete p.macs;

		return p;
	});

	return {
		clients: sort(out_clients, by_volume),
		protocols: sort(out_protocols, by_volume),
	};
}

function running(ctx) {
	let svc = ctx.ubus?.call('service', 'list', { name: 'nlbwmon' })?.nlbwmon;

	for (let n, inst in svc?.instances ?? {})
		if (inst.running)
			return true;

	return false;
}

// Start dates of the accounting periods in the database, newest first.
function periods(ctx) {
	ctx = context(ctx);

	let out = ctx.run([ NLBW, '-c', 'list' ]) ?? '';

	return {
		running: running(ctx),
		periods: sort(filter(map(split(out, "\n"), l => trim(l)), p => match(p, PERIOD_RE)), (a, b) => (a < b) ? 1 : -1),
	};
}

// Traffic of one period (default: the current one).
function data(ctx, period) {
	ctx = context(ctx);

	if (period != null && period != '' && !match(period, PERIOD_RE))
		return 2; // INVALID_ARGUMENT

	let argv = [ NLBW, '-c', 'json', '-g', 'mac,ip,layer7' ];

	if (period)
		push(argv, '-t', period);

	// No database for that period (or the daemon is down): empty, not an error.
	let r = rows(ctx.run(argv)) ?? [];

	return {
		period: period || null,
		running: running(ctx),
		...summarize(r, hosts(ctx)),
	};
}

export { rows, summarize, periods, data };
