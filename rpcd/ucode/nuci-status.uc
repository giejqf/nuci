// SPDX-License-Identifier: Apache-2.0
//
// nuci.status — realtime counters, processes, kernel log, conntrack.

'use strict';

import { methods } from 'nuci.rpc';
import { realtime, processes, kernel_log, conntrack } from 'nuci.status';

return {
	'nuci.status': methods({
		realtime: { call: () => realtime() },
		processes: { call: () => ({ processes: processes() }) },
		kernel_log: { call: () => ({ log: kernel_log() }) },
		conntrack: { call: () => ({ connections: conntrack() }) }
	})
};
