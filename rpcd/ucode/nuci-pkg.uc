// SPDX-License-Identifier: Apache-2.0
//
// nuci.pkg — apk package management. Changes run as a background job.

'use strict';

import { methods } from 'nuci.rpc';
import { list_installed, list_available, search, info, lists, update, change, job_status } from 'nuci.pkg';

return {
	'nuci.pkg': methods({
		list_installed: { call: () => list_installed() },
		list_available: {
			args: { offset: 0, limit: 0 },
			call: (args) => list_available(null, args.offset, args.limit)
		},
		search: { args: { query: 'query' }, call: (args) => search(null, args.query) },
		info: { args: { name: 'name' }, call: (args) => info(null, args.name) },
		lists: { call: () => lists() },
		update: { call: () => update() },
		add: {
			args: { packages: [], upgrade: true },
			call: (args) => change(null, 'add', args.packages, args.upgrade)
		},
		del: { args: { packages: [] }, call: (args) => change(null, 'del', args.packages) },
		job_status: { call: () => job_status() }
	})
};
