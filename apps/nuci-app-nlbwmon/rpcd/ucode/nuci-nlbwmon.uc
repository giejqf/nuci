// SPDX-License-Identifier: Apache-2.0
//
// nuci.nlbwmon — traffic accounting per client and protocol (nuci-app-nlbwmon).

'use strict';

import { connect } from 'ubus';
import { cursor } from 'uci';
import { methods } from 'nuci.rpc';
import { periods, data } from 'nuci.app.nlbwmon';

// procd is not hosted by rpcd: a synchronous call cannot deadlock.
function with_bus(fn) {
	let bus = connect();
	let res = fn({ ubus: bus, uci: cursor() });

	bus?.disconnect();

	return res;
}

return {
	'nuci.nlbwmon': methods({
		periods: { call: () => with_bus(ctx => periods(ctx)) },
		data: {
			args: { period: 'YYYY-MM-DD' },
			call: (args) => with_bus(ctx => data(ctx, args.period))
		}
	})
};
