// SPDX-License-Identifier: Apache-2.0
//
// nuci.network — protocol handlers installed since netifd started, and a
// restart of the network service to load them (a detached job).

'use strict';

import { connect } from 'ubus';
import { methods } from 'nuci.rpc';
import { protocols, restart } from 'nuci.network';

return {
	'nuci.network': methods({
		protocols: {
			call: () => {
				// procd is not hosted by rpcd: a synchronous call cannot deadlock.
				let bus = connect();
				let res = protocols({ ubus: bus });
				bus?.disconnect();
				return res;
			}
		},
		restart: { call: () => restart() }
	})
};
