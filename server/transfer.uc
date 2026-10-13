// SPDX-License-Identifier: Apache-2.0
//
// /nuci/transfer?name=<backup|restore|firmware> — streaming file transfer
// past the /ubus limits (64 KiB requests, file.read < 256 KiB), ADR-0005.
//   GET  ?name=backup     streams /tmp/nuci-backup.tar.gz (made by nuci.system
//                         backup_create); honours "Range: bytes=N-[M]" (206)
//   POST ?name=restore    stores the body as /tmp/nuci-restore.tar.gz
//   POST ?name=firmware   stores the body as /tmp/firmware.bin
// Uploads may come in chunks (&offset=N&total=T): each request appends at N
// to <path>.part, which becomes the file when it reaches T. A cut connection
// keeps what arrived; GET ?name=<upload>&status reports it ({ part, stored })
// so the client resumes there. No request has to outlive script_timeout.
// Auth: X-Nuci-Session header, checked with session.access in the
// "nuci-transfer" scope (object = name, function = read for downloads,
// write for uploads and their status). Names map to fixed paths; clients
// never pass a path.
//
// uhttpd compiles handlers in template mode, hence the {% %} wrapper.
{%

'use strict';

import * as fs from 'fs';
import { connect } from 'ubus';
import { lookup, session_of, parse_df_avail, query, parse_range, upload_plan } from 'nuci.transfer';

const CHUNK = 65536;

function reply(status, body) {
	uhttpd.send(`Status: ${status}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\n\r\n` +
		sprintf('%J', body));
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

function download(f, env) {
	let src = fs.open(f.path, 'r');
	if (!src)
		return reply('404 Not Found', { error: 'not_found' });
	let size = fs.stat(f.path)?.size ?? 0;
	let r = parse_range(env.headers?.range, size);
	if (r === false) {
		src.close();
		uhttpd.send(`Status: 416 Range Not Satisfiable\r\nContent-Range: bytes */${size}\r\n` +
			'Content-Length: 0\r\nCache-Control: no-store\r\n\r\n');
		return;
	}
	let start = r?.start ?? 0, left = r ? r.end - r.start + 1 : size;
	uhttpd.send(`Status: ${r ? '206 Partial Content' : '200 OK'}\r\n` +
		`Content-Type: ${f.type ?? 'application/octet-stream'}\r\nAccept-Ranges: bytes\r\n` +
		(r ? `Content-Range: bytes ${r.start}-${r.end}/${size}\r\n` : '') +
		`Content-Length: ${left}\r\nCache-Control: no-store\r\n\r\n`);
	if (start > 0)
		src.seek(start);
	let c;
	while (left > 0 && (c = src.read(min(CHUNK, left))) != null && length(c) > 0) {
		uhttpd.send(c);
		left -= length(c);
	}
	src.close();
}

function upload_status(f) {
	reply('200 OK', {
		part: fs.stat(f.path + '.part')?.size ?? 0,
		stored: fs.stat(f.path)?.size,
	});
}

function upload(f, env, q) {
	let tmp = f.path + '.part';
	let plan = upload_plan(q, +env.CONTENT_LENGTH, fs.stat(tmp)?.size, free_kb());
	if (plan.error)
		return reply(plan.status, { error: plan.error, size: plan.size });

	// A new upload replaces the stored file: "stored" in the status then
	// always belongs to the upload in progress.
	if (plan.mode == 'w')
		fs.unlink(f.path);
	let out = fs.open(tmp, plan.mode);
	if (!out)
		return reply('500 Internal Server Error', { error: 'open_failed' });
	let expected = +env.CONTENT_LENGTH, got = 0, c;
	while (got < expected && (c = uhttpd.recv(min(CHUNK, expected - got))) != null && length(c) > 0) {
		out.write(c);
		got += length(c);
	}
	out.close();
	// Whatever arrived stays: the client resumes from the reported size.
	let size = fs.stat(tmp)?.size ?? 0;
	if (got != expected)
		return reply('400 Bad Request', { error: 'short_body', size });
	if (plan.complete)
		fs.rename(tmp, f.path);
	reply('200 OK', { size, complete: plan.complete });
}

global.handle_request = function(env) {
	let method = env.REQUEST_METHOD;
	let q = query(env.QUERY_STRING, uhttpd.urldecode);
	let name = q.name;
	// GET &status on an upload name: how much of it the router has.
	let status = method == 'GET' && q.status != null && lookup(name, 'POST');
	let f = status || lookup(name, method);
	if (!f)
		return reply('404 Not Found', { error: 'unknown_name' });
	let sid = session_of(env.headers);
	if (!sid || !authorized(sid, name, (method == 'GET' && !status) ? 'read' : 'write'))
		return reply('403 Forbidden', { error: 'access_denied' });
	if (status)
		upload_status(f);
	else if (method == 'GET')
		download(f, env);
	else
		upload(f, env, q);
};

%}
