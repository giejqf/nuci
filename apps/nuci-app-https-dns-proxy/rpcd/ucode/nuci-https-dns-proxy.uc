// SPDX-License-Identifier: Apache-2.0
//
// nuci.https-dns-proxy — DNS-over-HTTPS proxy state and service actions
// (nuci-app-https-dns-proxy).

'use strict';

import { connect } from 'ubus';
import { cursor } from 'uci';
import { methods } from 'nuci.rpc';
import { status, service } from 'nuci.app.https_dns_proxy';

return {
	'nuci.https-dns-proxy': methods({
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
