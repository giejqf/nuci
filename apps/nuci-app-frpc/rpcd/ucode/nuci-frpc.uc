// SPDX-License-Identifier: Apache-2.0
//
// nuci.frpc — frp client state, proxies, log and service actions
// (nuci-app-frpc).

'use strict';

import { connect } from 'ubus';
import { cursor } from 'uci';
import { methods } from 'nuci.rpc';
import { status, service } from 'nuci.app.frpc';

return {
	'nuci.frpc': methods({
		status: {
			call: () => {
				// procd is not hosted by rpcd: a synchronous call cannot deadlock.
				let bus = connect();
				let res = status({ ubus: bus, uci: cursor() });
				bus?.disconnect();
				return res;
			}
		},
		service: {
			args: { action: 'start' },
			call: (args) => service(null, args.action)
		}
	})
};
