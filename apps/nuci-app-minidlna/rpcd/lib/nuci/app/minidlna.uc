// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-minidlna: state of the DLNA server (procd), the library counts
// and connected clients from minidlna's own status page, and a full rescan
// of the media folders as a detached job.

'use strict';

import { context } from 'nuci.util';
import { start, status as job_status } from 'nuci.job';
import { STATUS } from 'nuci.rpc';

const NAME = 'minidlna';
const INIT = '/etc/init.d/minidlna';
const DEFAULT_PORT = 8200;
const DEFAULT_DB = '/var/run/minidlna';
const PATH_RE = /^\/[A-Za-z0-9._\/-]*$/;

function port(c) {
	let p = c.uci?.get(NAME, 'config', 'port');

	return (match(`${p ?? ''}`, /^[0-9]{1,5}$/) && +p >= 1 && +p <= 65535) ? +p : DEFAULT_PORT;
}

// The database folder from the config, if it is a plain absolute path.
function db_dir(c) {
	let d = c.uci?.get(NAME, 'config', 'db_dir') ?? DEFAULT_DB;

	return (type(d) == 'string' && match(d, PATH_RE) && index(d, '..') < 0 && d != '/') ? d : null;
}

function cells(row) {
	return map(match(row, /<td>([^<]*)<\/td>/g) ?? [], m => trim(m[1]));
}

// minidlna's status page (http://127.0.0.1:<port>/): library counts and clients.
function parse_status(html) {
	if (type(html) != 'string' || index(html, 'MiniDLNA') < 0)
		return null;

	let count = (label) => {
		let m = match(html, regexp(`<td>${label}</td><td>([0-9]+)</td>`));
		return m ? +m[1] : null;
	};
	let clients = [];
	let i = index(html, 'Connected clients');

	for (let row in (i >= 0) ? split(substr(html, i), '<tr>') : []) {
		let c = cells(row);

		// The header row, and the status request itself (from loopback).
		if (length(c) < 5 || c[0] == 'ID' || c[2] == '127.0.0.1')
			continue;

		push(clients, { type: c[1], ip: c[2], mac: c[3], connections: match(c[4], /^[0-9]+$/) ? +c[4] : 0 });
	}

	return {
		version: match(html, /<TITLE>MiniDLNA ([^<]+)<\/TITLE>/)?.[1] ?? null,
		audio: count('Audio files'),
		video: count('Video files'),
		image: count('Image files'),
		clients,
	};
}

function status(ctx) {
	let c = context(ctx);

	let svc = c.ubus?.call('service', 'list', { name: NAME })?.[NAME];
	let running = false;

	for (let n, inst in svc?.instances ?? {})
		if (inst.running)
			running = true;

	let library = running
		? parse_status(c.run([ '/bin/uclient-fetch', '-q', '-T', '3', '-O', '-', `http://127.0.0.1:${port(c)}/` ]))
		: null;

	return {
		running,
		port: port(c),
		library,
		job: job_status(c, NAME),
	};
}

// Stop, drop the database, start again: minidlna reads every folder anew.
function rescan(ctx) {
	let c = context(ctx);
	let db = db_dir(c);

	if (!db)
		return STATUS.NOT_SUPPORTED;

	// The path is an argument to the fixed script, never part of it.
	return start(c, NAME, [ '/bin/sh', '-c', '"$0" stop; rm -f "$1/files.db"; "$0" start', INIT, db ]);
}

export { parse_status, status, rescan };
