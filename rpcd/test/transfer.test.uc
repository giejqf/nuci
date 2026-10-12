// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, done } from 'harness';
import { lookup, session_of, parse_df_avail, fits } from 'nuci.transfer';

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

done();
