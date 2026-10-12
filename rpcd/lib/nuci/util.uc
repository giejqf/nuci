// SPDX-License-Identifier: Apache-2.0
//
// Shared helpers for NuCI collectors. Every collector takes a context
// { root, run, ubus, uci } so host tests can point it at fixture trees and
// canned command output instead of the live system.

'use strict';

import { readfile, popen, lsdir } from 'fs';

const SAFE_ARG = /^[A-Za-z0-9@%+,._\/:=-]*$/;

// Run a fixed command (argv array) and return its stdout. Arguments are
// validated against a strict charset and never reach a shell unquoted.
function default_run(argv) {
	for (let a in argv)
		if (type(a) != 'string' || !match(a, SAFE_ARG))
			return null;

	let p = popen(join(' ', argv) + ' 2>/dev/null', 'r');

	if (!p)
		return null;

	let out = p.read('all');
	p.close();

	return out;
}

function context(ctx) {
	ctx ??= {};

	return {
		root: ctx.root ?? '',
		run: ctx.run ?? default_run,
		ubus: ctx.ubus,
		uci: ctx.uci,
	};
}

function read(ctx, path) {
	return readfile(ctx.root + path);
}

function read_trim(ctx, path) {
	let s = readfile(ctx.root + path);

	return (s == null) ? null : trim(s);
}

function read_int(ctx, path) {
	let s = read_trim(ctx, path);

	return (s == null || !match(s, /^-?[0-9]+$/)) ? null : +s;
}

function list(ctx, path) {
	return sort(lsdir(ctx.root + path) ?? []);
}

function lines(text) {
	return filter(split(text ?? '', '\n'), l => length(l));
}

export { context, default_run, read, read_trim, read_int, list, lines };
