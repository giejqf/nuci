// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, done } from 'harness';
import { lookup, session_of, parse_df_avail, fits, query, parse_range, upload_plan } from 'nuci.transfer';

test('only allowlisted names with the right method resolve', () => {
	eq(lookup('backup', 'GET').path, '/tmp/nuci-backup.tar.gz');
	eq(lookup('backup', 'POST'), null);
	eq(lookup('firmware', 'POST').path, '/tmp/firmware.bin');
	eq(lookup('restore', 'POST').path, '/tmp/nuci-restore.tar.gz');
	eq(lookup('../etc/shadow', 'GET'), null);
	eq(lookup('constructor', 'GET'), null);
});

test('session comes from the header, never null or malformed', () => {
	eq(session_of({ 'x-nuci-session': 'fdd7a20456c721c148d5bd5d0b1e8e2a' }), 'fdd7a20456c721c148d5bd5d0b1e8e2a');
	eq(session_of({ 'x-nuci-session': '00000000000000000000000000000000' }), null);
	eq(session_of({ 'x-nuci-session': 'FDD7' }), null);
	eq(session_of({}), null);
	eq(session_of(null), null);
});

test('free space guard', () => {
	let df = 'Filesystem           1K-blocks      Used Available Use% Mounted on\ntmpfs                   243620       212    243408   0% /tmp\n';
	eq(parse_df_avail(df), 243408);
	eq(parse_df_avail(''), null);
	eq(parse_df_avail('garbage'), null);
	eq(fits(30 * 1024 * 1024, 243408), true);
	eq(fits(240 * 1024 * 1024, 243408), false);
	eq(fits(10, null), false);
});

test('query string: decoded values, empty keys skipped', () => {
	eq(query('name=firmware&offset=10&total=20&status', null), { name: 'firmware', offset: '10', total: '20', status: '' });
	eq(query('=x&name=a%20b', (v) => replace(v, '%20', ' ')), { name: 'a b' });
	eq(query(null), {});
});

test('download ranges', () => {
	eq(parse_range(null, 100), null);
	eq(parse_range('bytes=0-', 100), { start: 0, end: 99 });
	eq(parse_range('bytes=10-19', 100), { start: 10, end: 19 });
	eq(parse_range('bytes=90-500', 100), { start: 90, end: 99 });
	eq(parse_range('bytes=100-', 100), false);
	eq(parse_range('bytes=20-10', 100), false);
	// Suffix and multi ranges are not supported: the whole file (allowed by RFC 9110).
	eq(parse_range('bytes=-10', 100), null);
	eq(parse_range('bytes=0-1,5-6', 100), null);
});

test('uploads in chunks: offsets must continue the .part file', () => {
	const MB = 1024 * 1024, AVAIL = 100 * 1024;

	// 0.2 clients: the whole file in one request.
	eq(upload_plan({}, 5, null, AVAIL), { mode: 'w', size: 5, complete: true });
	eq(upload_plan({}, 0, null, AVAIL).status, '411 Length Required');
	// First chunk truncates (an older .part counts as free space), later ones append.
	eq(upload_plan({ offset: '0', total: `${20 * MB}` }, MB, 50 * MB, 30 * 1024), { mode: 'w', size: MB, complete: false });
	eq(upload_plan({ offset: `${MB}`, total: `${2 * MB}` }, MB, MB, AVAIL), { mode: 'a', size: 2 * MB, complete: true });
	// A gap or an overlap: the router says where it is.
	eq(upload_plan({ offset: `${2 * MB}`, total: `${4 * MB}` }, MB, MB, AVAIL), { status: '409 Conflict', error: 'offset_mismatch', size: MB });
	eq(upload_plan({ offset: '5', total: '10' }, 1, null, AVAIL).size, 0);
	// Beyond the announced total, junk numbers, no space.
	eq(upload_plan({ offset: '0', total: '10' }, 11, null, AVAIL).error, 'bad_range');
	eq(upload_plan({ offset: '-1', total: '10' }, 1, null, AVAIL).error, 'bad_range');
	eq(upload_plan({ offset: '0' }, 1, null, AVAIL).error, 'bad_range');
	eq(upload_plan({ offset: '0', total: `${200 * MB}` }, MB, null, AVAIL).error, 'no_space');
	eq(upload_plan({ offset: `${MB}`, total: `${200 * MB}` }, MB, MB, AVAIL).error, 'no_space');
	eq(upload_plan({ offset: '0', total: '10' }, 1, null, null).error, 'no_space');
});

done();
