// SPDX-License-Identifier: Apache-2.0
//
// fw4 helpers for nuci.firewall: the ruleset fw4 would generate from the
// committed config (`fw4 print`) and the live one (`nft list ruleset`).

'use strict';

import { context } from 'nuci.util';

const MAX = 512 * 1024;

function bounded(text) {
	text ??= '';

	return (length(text) > MAX) ? { text: substr(text, 0, MAX), truncated: true } : { text, truncated: false };
}

// Returns { text, truncated } or a ubus status code.
function preview(ctx) {
	ctx = context(ctx);

	let out = ctx.run([ 'fw4', '-q', 'print' ]);

	return (out == null) ? 9 : bounded(out);
}

function ruleset(ctx) {
	ctx = context(ctx);

	let out = ctx.run([ 'nft', 'list', 'ruleset' ]);

	return (out == null) ? 9 : bounded(out);
}

export { preview, ruleset };
