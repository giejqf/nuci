// SPDX-License-Identifier: Apache-2.0
//
// nuci.status — realtime counters, processes, kernel log, conntrack.

'use strict';

import { readfile } from 'fs';
import { methods, STATUS } from 'nuci.rpc';
import {
	realtime, processes, kernel_log, conntrack, conntrack_summary, cpu_total, signal
} from 'nuci.status';

return {
	'nuci.status': methods({
		realtime: { call: () => realtime() },
		processes: {
			call: () => ({ processes: processes(), total_ticks: cpu_total(readfile('/proc/stat')) })
		},
		kernel_log: {
			// Seconds since boot as a decimal string: JSON numbers would arrive as int or double.
			args: { after: 'after' },
			call: (args) => {
				if (args.after != null && !match(args.after, /^[0-9]+(\.[0-9]+)?$/))
					return STATUS.INVALID_ARGUMENT;

				return { log: kernel_log(null, (args.after != null) ? +args.after : null) };
			}
		},
		conntrack: { call: () => ({ connections: conntrack() }) },
		conntrack_summary: { call: () => conntrack_summary() },
		signal: {
			args: { pid: 0, signal: 0 },
			call: (args) => {
				let rc = signal(null, args.pid, args.signal);

				return rc ? rc : { pid: args.pid, signal: args.signal };
			}
		}
	})
};
