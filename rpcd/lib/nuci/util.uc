// SPDX-License-Identifier: Apache-2.0
//
// Shared helpers for NuCI collectors. Every collector takes a context
// { root, run, ubus, uci } so host tests can point it at fixture trees and
// canned command output instead of the live system.

'use strict';

import { readfile, popen, lsdir } from 'fs';

// Single-quote one argument for /bin/sh: the shell sees it as one literal word.
function shell_quote(s) {
	return "'" + replace(s, "'", "'\\''") + "'";
}

// Run a command given as an argv array and return its stdout. fs.popen()
// needs a command string, so every argument is quoted: argv reaches the
// program unchanged and nothing is ever interpreted by the shell. Callers
// still validate user input against allowlists before building argv.
function default_run(argv) {
	for (let a in argv)
		if (type(a) != 'string' || index(a, '\n') >= 0 || index(a, '\u0000') >= 0)
			return null;

	let p = popen(join(' ', map(argv, shell_quote)) + ' 2>/dev/null', 'r');

	if (!p)
		return null;

	let out = p.read('all');
	p.close();

	return out;
}

// Run argv without a shell and return the exit code (for detached jobs).
function default_spawn(argv) {
	return system(argv);
}

function context(ctx) {
	ctx ??= {};

	return {
		root: ctx.root ?? '',
		run: ctx.run ?? default_run,
		spawn: ctx.spawn ?? default_spawn,
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

export { context, default_run, default_spawn, shell_quote, read, read_trim, read_int, list, lines };
