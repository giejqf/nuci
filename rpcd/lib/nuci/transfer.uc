// SPDX-License-Identifier: Apache-2.0
//
// Pure parts of the /nuci/transfer handler (server/transfer.uc, ADR-0005):
// the fixed name -> file allowlist, request checks and the /tmp space guard.
// Files are never addressed by path from the client.

'use strict';

const SID_RE = /^[0-9a-f]{32}$/;
const NULL_SID = '00000000000000000000000000000000';

// name -> { path, method, filename? }. GET downloads, POST uploads.
const FILES = {
	backup: { path: '/tmp/nuci-backup.tar.gz', method: 'GET', type: 'application/gzip' },
	restore: { path: '/tmp/nuci-restore.tar.gz', method: 'POST' },
	firmware: { path: '/tmp/firmware.bin', method: 'POST' },
};

// Keep this much of /tmp free after an upload (tmpfs is RAM).
const RESERVE_KB = 4096;

function lookup(name, method) {
	let f = FILES[name];
	return (f && f.method == method) ? f : null;
}

/** The session id from the X-Nuci-Session header (never the URL: logs). */
function session_of(headers) {
	let sid = headers?.['x-nuci-session'];
	return (type(sid) == 'string' && match(sid, SID_RE) && sid != NULL_SID) ? sid : null;
}

/** Available KiB from `df -k <dir>` output, or null. */
function parse_df_avail(text) {
	let lines = filter(split(text ?? '', '\n'), (l) => length(l));
	let f = split(trim(lines[-1] ?? ''), /\s+/);
	let avail = +f[3];
	return (length(f) >= 6 && avail >= 0 && avail == avail) ? avail : null;
}

/** Whether an upload of `bytes` leaves RESERVE_KB free (null avail = unknown -> refuse). */
function fits(bytes, avail_kb) {
	return avail_kb != null && bytes >= 0 && (bytes / 1024) + RESERVE_KB <= avail_kb;
}

export { FILES, RESERVE_KB, lookup, session_of, parse_df_avail, fits };
