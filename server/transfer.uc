// SPDX-License-Identifier: Apache-2.0
//
// /nuci/transfer?name=<backup|restore|firmware> — streaming file transfer
// past the /ubus limits (64 KiB requests, file.read < 256 KiB), ADR-0005.
//   GET  ?name=backup     streams /tmp/nuci-backup.tar.gz (made by nuci.system backup_create)
//   POST ?name=restore    stores the body as /tmp/nuci-restore.tar.gz
//   POST ?name=firmware   stores the body as /tmp/firmware.bin
// Auth: X-Nuci-Session header, checked with session.access in the
// "nuci-transfer" scope (object = name, function = read for GET, write for
// POST). Names map to fixed paths; clients never pass a path.
//
// uhttpd compiles handlers in template mode, hence the {% %} wrapper.
{%

'use strict';

import * as fs from 'fs';
import { connect } from 'ubus';
import { lookup, session_of, parse_df_avail, fits } from 'nuci.transfer';

const CHUNK = 65536;

function reply(status, body) {
	uhttpd.send(`Status: ${status}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\n\r\n` +
		sprintf('%J', body));
}

function query_name(qs) {
	for (let kv in split(qs ?? '', '&')) {
		let p = split(kv, '=', 2);
		if (p[0] == 'name') return uhttpd.urldecode(p[1] ?? '');
	}
	return null;
}

function authorized(sid, name, func) {
	let bus = connect();
	let res = bus?.call('session', 'access', {
		ubus_rpc_session: sid, scope: 'nuci-transfer', object: name, function: func
	});
	bus?.disconnect();
	return !!res?.access;
}

function free_kb() {
	let p = fs.popen('df -k /tmp', 'r');
	let out = p?.read('all');
	p?.close();
	return parse_df_avail(out);
}

function download(f) {
	let src = fs.open(f.path, 'r');
	if (!src)
		return reply('404 Not Found', { error: 'not_found' });
	let size = fs.stat(f.path)?.size ?? 0;
	uhttpd.send(`Status: 200 OK\r\nContent-Type: ${f.type ?? 'application/octet-stream'}\r\n` +
		`Content-Length: ${size}\r\nCache-Control: no-store\r\n\r\n`);
	let c;
	while ((c = src.read(CHUNK)) != null && length(c) > 0)
		uhttpd.send(c);
	src.close();
}

function upload(f, env) {
	let expected = +env.CONTENT_LENGTH;
	if (!(expected > 0))
		return reply('411 Length Required', { error: 'length_required' });
	if (!fits(expected, free_kb()))
		return reply('413 Payload Too Large', { error: 'no_space' });

	let tmp = f.path + '.part';
	let out = fs.open(tmp, 'w');
	if (!out)
		return reply('500 Internal Server Error', { error: 'open_failed' });
	let total = 0, c;
	while (total < expected && (c = uhttpd.recv(CHUNK)) != null && length(c) > 0) {
		out.write(c);
		total += length(c);
	}
	out.close();
	if (total != expected) {
		fs.unlink(tmp);
		return reply('400 Bad Request', { error: 'short_body', received: total });
	}
	fs.rename(tmp, f.path);
	reply('200 OK', { size: total });
}

global.handle_request = function(env) {
	let method = env.REQUEST_METHOD;
	let name = query_name(env.QUERY_STRING);
	let f = lookup(name, method);
	if (!f)
		return reply('404 Not Found', { error: 'unknown_name' });
	let sid = session_of(env.headers);
	if (!sid || !authorized(sid, name, method == 'GET' ? 'read' : 'write'))
		return reply('403 Forbidden', { error: 'access_denied' });
	if (method == 'GET')
		download(f);
	else
		upload(f, env);
};

%}
