// SPDX-License-Identifier: Apache-2.0
//
// GET /nuci/probe — connectivity probe for the apply protocol (ADR-0002).
// Answers whether the router-side address of *this* connection is still
// assigned and still planned by the committed config, and whether uhttpd's
// committed listeners still serve it. A browser may reuse a keep-alive
// connection whose address or listener was removed, and netifd and uhttpd
// apply changes seconds after `uci apply`; neither may count as "reachable".
//
// uhttpd compiles handlers in template mode, hence the {% %} wrapper.
{%

'use strict';

import { connect } from 'ubus';
import { cursor } from 'uci';
import { address_present, address_planned, listener_planned, normalize_addr } from 'nuci.net';

global.handle_request = function(env) {
	let addr = env.SERVER_ADDR;
	let bus = connect();
	let uci = cursor();
	// Assigned now, and still planned by the committed config (netifd and
	// uhttpd may lag).
	let ok = address_present(null, addr) && address_planned({ ubus: bus, uci }, addr) &&
		listener_planned({ uci }, addr, env.SERVER_PORT, env.HTTPS == 'on');

	bus?.disconnect();

	uhttpd.send('Status: 200 OK\r\n' +
		'Content-Type: application/json\r\n' +
		'Cache-Control: no-store\r\n' +
		// Harmless to share: lets a page probe a new LAN address cross-origin (ADR-0002).
		'Access-Control-Allow-Origin: *\r\n\r\n' +
		sprintf('%J', { ok, address: normalize_addr(addr) }));
};

%}
