// SPDX-License-Identifier: Apache-2.0
//
// nuci.adblock — DNS blocklists with adblock (nuci-app-adblock). adblock's
// own actions run as detached jobs ("adblock", "adblock-search").

'use strict';

import { methods } from 'nuci.rpc';
import { status, feeds, lists, run, set_list, search } from 'nuci.app.adblock';

return {
	'nuci.adblock': methods({
		status: { call: () => status() },
		feeds: { call: () => feeds() },
		lists: { call: () => lists() },
		run: { args: { action: 'reload' }, call: (args) => run(null, args.action) },
		set_list: {
			args: { list: 'allow', domains: [] },
			call: (args) => set_list(null, args.list, args.domains)
		},
		search: { args: { domain: 'example.com' }, call: (args) => search(null, args.domain) }
	})
};
