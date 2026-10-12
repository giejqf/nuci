// SPDX-License-Identifier: Apache-2.0
//
// nuci.diag — ping / traceroute / nslookup with bounded arguments; output is
// polled through `status` (one diagnostic at a time).

'use strict';

import { methods } from 'nuci.rpc';
import { ping, traceroute, nslookup, status } from 'nuci.diag';

return {
	'nuci.diag': methods({
		ping: {
			args: { host: 'host', count: 0, family: 0 },
			call: (args) => ping(null, args.host, args.count, args.family)
		},
		traceroute: {
			args: { host: 'host', family: 0 },
			call: (args) => traceroute(null, args.host, args.family)
		},
		nslookup: {
			args: { host: 'host', server: 'server' },
			call: (args) => nslookup(null, args.host, args.server)
		},
		status: { call: () => status() }
	})
};
