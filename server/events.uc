// SPDX-License-Identifier: Apache-2.0
//
// NuCI Server-Sent Events handler for uhttpd-mod-ucode (D18, ADR-0001).
//
// GET /nuci/events?sid=<ubus_rpc_session>&streams=heartbeat,stats[&interval=2][&last=<id>]
//
// uhttpd forks one process per request and SIGKILLs it after the global
// script_timeout, so every stream is bounded: it ends cleanly before the
// deadline and asks the EventSource to reconnect (see ADR-0001).
//
// uhttpd compiles handlers in template mode, hence the {% %} wrapper.
{%

'use strict';

import { connect } from 'ubus';
import { cursor } from 'uci';
import { realtime } from 'nuci.status';

const SID_RE = /^[0-9a-f]{32}$/;
const NULL_SID = '00000000000000000000000000000000';
// Stream name -> collector. Collectors are shared with the nuci.* plugins.
const COLLECTORS = {
	heartbeat: (start) => ({ t: time(), uptime: time() - start }),
	stats: () => realtime(),
};

function parse_query(qs) {
	let out = {};

	for (let pair in split(qs ?? '', '&')) {
		let kv = split(pair, '=', 2);

		if (length(kv[0]))
			out[uhttpd.urldecode(kv[0])] = uhttpd.urldecode(kv[1] ?? '');
	}

	return out;
}

function reply_error(code, msg) {
	uhttpd.send(`Status: ${code} ${msg}\r\nContent-Type: text/plain\r\nCache-Control: no-store\r\n\r\n${msg}\n`);
}

// Stream lifetime in seconds: below uhttpd's script_timeout, capped by nuci.main.sse_lifetime.
function stream_lifetime() {
	let ctx = cursor();
	let script_timeout = +(ctx.get('uhttpd', 'main', 'script_timeout') ?? 60);
	let configured = +(ctx.get('nuci', 'main', 'sse_lifetime') ?? 0);
	let limit = (script_timeout > 0) ? script_timeout - 5 : 3600;

	if (configured > 0 && configured < limit)
		limit = configured;

	return (limit < 5) ? 5 : limit;
}

function send_event(name, id, data) {
	uhttpd.send(`id: ${id}\nevent: ${name}\ndata: ${sprintf('%J', data)}\n\n`);
	uhttpd.flush();
}

global.handle_request = function(env) {
	if (env.REQUEST_METHOD != 'GET')
		return reply_error(405, 'Method Not Allowed');

	let q = parse_query(env.QUERY_STRING);
	let sid = q.sid;

	if (!match(sid, SID_RE) || sid == NULL_SID)
		return reply_error(403, 'Forbidden');

	let streams = uniq(filter(split(q.streams ?? 'heartbeat', ','), s => s in COLLECTORS));

	if (!length(streams))
		return reply_error(400, 'Bad Request');

	let bus = connect();

	if (!bus)
		return reply_error(503, 'Service Unavailable');

	for (let s in streams) {
		let res = bus.call('session', 'access', {
			ubus_rpc_session: sid, scope: 'nuci-events', object: s, function: 'read'
		});

		if (!res?.access)
			return reply_error(403, 'Forbidden');
	}

	let interval = +(q.interval ?? 1);
	interval = (interval >= 1 && interval <= 60) ? interval : 1;

	let lifetime = stream_lifetime();
	let start = time();
	// Event ids continue across reconnects (EventSource header, or `last` from our client).
	let id = +(env.headers?.['last-event-id'] ?? q.last ?? 0) || 0;

	uhttpd.send('Status: 200 OK\r\n' +
		'Content-Type: text/event-stream\r\n' +
		'Cache-Control: no-store\r\n' +
		'X-Accel-Buffering: no\r\n\r\n');
	uhttpd.send(`retry: 2000\n: nuci events, lifetime ${lifetime}s\n\n`);
	uhttpd.flush();

	let ticks = 0;

	while (time() - start < lifetime) {
		for (let s in streams)
			send_event(s, ++id, COLLECTORS[s](start));

		// Re-check the session every 10 ticks so a logout ends the stream.
		if (++ticks % 10 == 0 && !bus.call('session', 'access', {
			ubus_rpc_session: sid, scope: 'nuci-events', object: streams[0], function: 'read'
		})?.access)
			break;

		sleep(interval * 1000);
	}

	uhttpd.send('event: end\ndata: {"reconnect":true}\n\n');
	uhttpd.flush();
};

%}
