// SPDX-License-Identifier: Apache-2.0
//
// nuci.asu — attended sysupgrade through owut (nuci-app-asu, ADR-0007).
// Each step runs as the detached job "asu"; status reports the job and the
// last check's summary.

'use strict';

import { methods } from 'nuci.rpc';
import { status, run } from 'nuci.app.asu';

return {
	'nuci.asu': methods({
		status: { call: () => status() },
		check: { args: { version: 'version' }, call: (args) => run(null, 'check', args.version) },
		download: { args: { version: 'version' }, call: (args) => run(null, 'download', args.version) },
		install: { call: () => run(null, 'install') }
	})
};
