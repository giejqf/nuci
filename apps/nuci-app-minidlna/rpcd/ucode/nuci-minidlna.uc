// SPDX-License-Identifier: Apache-2.0
//
// nuci.minidlna — DLNA media server state and rescan (nuci-app-minidlna).

'use strict';

import { connect } from 'ubus';
import { cursor } from 'uci';
import { methods } from 'nuci.rpc';
import { status, rescan } from 'nuci.app.minidlna';

return {
	'nuci.minidlna': methods({
		status: {
			call: () => {
				// procd is not hosted by rpcd: a synchronous call cannot deadlock.
				let bus = connect();
				let res = status({ ubus: bus, uci: cursor() });
				bus?.disconnect();
				return res;
			}
		},
		rescan: { call: () => rescan({ uci: cursor() }) }
	})
};
