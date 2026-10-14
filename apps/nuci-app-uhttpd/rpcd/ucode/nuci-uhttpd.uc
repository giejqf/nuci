// SPDX-License-Identifier: Apache-2.0
//
// nuci.uhttpd — web server listeners, certificate details and a new
// certificate (nuci-app-uhttpd).

'use strict';

import { connect } from 'ubus';
import { cursor } from 'uci';
import { methods } from 'nuci.rpc';
import { status, regenerate } from 'nuci.app.uhttpd';

return {
	'nuci.uhttpd': methods({
		status: {
			call: () => {
				// procd is not hosted by rpcd: a synchronous call cannot deadlock.
				let bus = connect();
				let res = status({ ubus: bus, uci: cursor() });
				bus?.disconnect();
				return res;
			}
		},
		regenerate: { call: () => regenerate({ uci: cursor() }) }
	})
};
