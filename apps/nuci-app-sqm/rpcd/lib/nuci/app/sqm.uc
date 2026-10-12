// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-sqm: active queueing disciplines on the interfaces sqm-scripts
// manages (egress on the device, ingress on its ifb4<dev>).

'use strict';

import { context } from 'nuci.util';

const IFACE_RE = /^[A-Za-z0-9_.@-]{1,15}$/;

/** Root qdiscs from `tc -s qdisc show dev X`. */
function parse_qdiscs(text) {
	let out = [], cur = null;
	for (let line in split(text ?? '', '\n')) {
		let m = match(line, /^qdisc ([^ ]+) ([0-9a-f]+:)[^ ]* (root|parent [^ ]+)(.*)$/);
		if (m) {
			cur = { kind: m[1], handle: m[2], root: m[3] == 'root' };
			let bw = match(m[4], /bandwidth ([^ ]+)/);
			if (bw) cur.bandwidth = bw[1];
			push(out, cur);
			continue;
		}
		let sent = match(line, /^ Sent ([0-9]+) bytes ([0-9]+) pkt \(dropped ([0-9]+)/);
		if (sent && cur) {
			cur.sent_bytes = +sent[1];
			cur.sent_packets = +sent[2];
			cur.dropped = +sent[3];
		}
	}
	return filter(out, (q) => q.root);
}

function status(ctx) {
	let c = context(ctx), out = {};
	c.uci?.foreach('sqm', 'queue', (s) => {
		let dev = s.interface;
		if (type(dev) != 'string' || !match(dev, IFACE_RE) || out[dev]) return;
		out[dev] = {
			egress: parse_qdiscs(c.run([ 'tc', '-s', 'qdisc', 'show', 'dev', dev ])),
			ingress: parse_qdiscs(c.run([ 'tc', '-s', 'qdisc', 'show', 'dev', `ifb4${dev}` ])),
		};
	});
	return { interfaces: out };
}

export { parse_qdiscs, status };
