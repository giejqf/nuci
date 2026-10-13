// SPDX-License-Identifier: Apache-2.0
//
// Pure parts of the /nuci/transfer handler (server/transfer.uc, ADR-0005):
// the fixed name -> file allowlist, request checks, the /tmp space guard and
// the resumable parts (download ranges, uploads in chunks at an offset).
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

const INT_RE = /^[0-9]{1,12}$/;

/** Query string -> { key: value } (values url-decoded by `decode`). */
function query(qs, decode) {
	let out = {};

	for (let kv in split(qs ?? '', '&')) {
		let p = split(kv, '=', 2);

		if (length(p[0]))
			out[p[0]] = decode ? decode(p[1] ?? '') : (p[1] ?? '');
	}

	return out;
}

const as_int = (v) => (type(v) == 'string' && match(v, INT_RE)) ? +v : null;

/**
 * A `Range: bytes=N-[M]` header for a file of `size` bytes: { start, end }
 * (inclusive), null to send the whole file (no or unsupported range), false
 * when nothing of the file is in range (416).
 */
function parse_range(header, size) {
	let m = (type(header) == 'string') ? match(header, /^bytes=([0-9]{1,12})-([0-9]{0,12})$/) : null;

	if (!m)
		return null;

	let start = +m[1];
	let end = length(m[2]) ? +m[2] : size - 1;

	if (start >= size || end < start)
		return false;

	return { start, end: min(end, size - 1) };
}

/**
 * Plan one upload request: `q` the query ({ offset, total } as strings; both
 * absent: the whole file in this request), `len` the body length, `part` the
 * size of the .part file (null: none), `avail_kb` free KiB in /tmp.
 * -> { mode: 'w'|'a', size: part size after it, complete } or
 *    { status, error, size? } to refuse it.
 */
function upload_plan(q, len, part, avail_kb) {
	let offset = (q.offset == null && q.total == null) ? 0 : as_int(q.offset);
	let total = (q.offset == null && q.total == null) ? len : as_int(q.total);

	if (!(len > 0))
		return { status: '411 Length Required', error: 'length_required' };

	if (offset == null || total == null || offset + len > total)
		return { status: '400 Bad Request', error: 'bad_range' };

	if (offset == 0) {
		// A new upload replaces what is left of an earlier one.
		if (!fits(total, (avail_kb == null) ? null : avail_kb + int((part ?? 0) / 1024)))
			return { status: '413 Payload Too Large', error: 'no_space' };

		return { mode: 'w', size: len, complete: len == total };
	}

	if (part != offset)
		return { status: '409 Conflict', error: 'offset_mismatch', size: part ?? 0 };

	if (!fits(total - offset, avail_kb))
		return { status: '413 Payload Too Large', error: 'no_space' };

	return { mode: 'a', size: offset + len, complete: offset + len == total };
}

export { FILES, RESERVE_KB, lookup, session_of, parse_df_avail, fits, query, parse_range, upload_plan };
