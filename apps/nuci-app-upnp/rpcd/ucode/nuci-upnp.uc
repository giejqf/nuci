// SPDX-License-Identifier: Apache-2.0
//
// nuci.upnp — UPnP/NAT-PMP daemon state and active mappings (nuci-app-upnp).

'use strict';

import { connect } from 'ubus';
import { cursor } from 'uci';
import { methods } from 'nuci.rpc';
import { status } from 'nuci.app.upnp';

return {
	'nuci.upnp': methods({
		status: {
			call: () => {
				// procd is not hosted by rpcd: a synchronous call cannot deadlock.
				let bus = connect();
				let res = status({ ubus: bus, uci: cursor() });
				bus?.disconnect();
				return res;
			}
		}
	})
};
