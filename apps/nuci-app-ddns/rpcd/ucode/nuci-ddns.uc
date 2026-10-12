// SPDX-License-Identifier: Apache-2.0
//
// nuci.ddns — providers, service status, logs and "update now" (nuci-app-ddns).

'use strict';

import { cursor } from 'uci';
import { methods } from 'nuci.rpc';
import { providers, status, log, update, update_status } from 'nuci.app.ddns';

return {
	'nuci.ddns': methods({
		providers: { call: () => providers() },
		status: { call: () => status({ uci: cursor() }) },
		log: { args: { section: '' }, call: (args) => log(null, args.section) },
		update: { call: () => update() },
		update_status: { call: () => update_status() }
	})
};
