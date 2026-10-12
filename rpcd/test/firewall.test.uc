// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, done } from 'harness';
import { preview, ruleset } from 'nuci.firewall';

test('preview runs fw4 print and bounds the output', () => {
	let ran = [];
	eq(preview({ run: (argv) => (push(ran, argv), 'table inet fw4 {}\n') }), { text: 'table inet fw4 {}\n', truncated: false });
	eq(ran, [ [ 'fw4', '-q', 'print' ] ]);
	let big = preview({ run: () => sprintf('%600000s', 'x') });
	eq([ length(big.text), big.truncated ], [ 512 * 1024, true ]);
	eq(preview({ run: () => null }), 9);
});

test('ruleset lists the live nftables ruleset', () => {
	let ran = [];
	ruleset({ run: (argv) => (push(ran, argv), '') });
	eq(ran, [ [ 'nft', 'list', 'ruleset' ] ]);
});

done();
