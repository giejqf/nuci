// SPDX-License-Identifier: Apache-2.0
//
// GET /nuci/probe — connectivity probe for the apply protocol (ADR-0002).
// Answers whether the router-side address of *this* connection is still
// assigned. A browser may reuse a keep-alive connection whose address was
// removed by the new config; such a probe must not count as "reachable".
//
// uhttpd compiles handlers in template mode, hence the {% %} wrapper.
{%

'use strict';

import { address_present, normalize_addr } from 'nuci.net';

global.handle_request = function(env) {
	let addr = env.SERVER_ADDR;
	let ok = address_present(null, addr);

	uhttpd.send('Status: 200 OK\r\n' +
		'Content-Type: application/json\r\n' +
		'Cache-Control: no-store\r\n' +
		// Harmless to share: lets a page probe a new LAN address cross-origin (ADR-0002).
		'Access-Control-Allow-Origin: *\r\n\r\n' +
		sprintf('%J', { ok, address: normalize_addr(addr) }));
};

%}
