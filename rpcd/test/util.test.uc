// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, ok, done } from 'harness';
import { default_run, shell_quote } from 'nuci.util';

test('default_run passes hostile arguments through verbatim (real /bin/sh)', () => {
	let args = [ 'a b', "it's", '$HOME', '*', '`id`', '$(id)', ';reboot', '"q"', '\\\\' ];
	let out = default_run([ 'printf', '%s|', ...args ]);
	eq(out, join('|', args) + '|');
});

test('default_run refuses newlines and NULs', () => {
	eq(default_run([ 'echo', 'a\nb' ]), null);
	eq(default_run([ 'echo', 'a\u0000b' ]), null);
	eq(default_run([ 'echo', 1 ]), null);
});

test('shell_quote escapes single quotes', () => {
	eq(shell_quote("a'b"), "'a'\\''b'");
});

done();
