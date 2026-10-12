// SPDX-License-Identifier: Apache-2.0
//
// nuci.users — non-root NuCI users and their ACL groups (ADR-0006).

'use strict';

import { cursor } from 'uci';
import { methods } from 'nuci.rpc';
import { groups, list, create, update, set_password, remove } from 'nuci.users';

const ctx = () => ({ uci: cursor() });

return {
	'nuci.users': methods({
		list: { call: () => list(ctx()) },
		groups: { call: () => ({ groups: groups() }) },
		create: {
			args: { username: '', password: '', read: [], write: [] },
			call: (args) => create(ctx(), args)
		},
		update: {
			args: { username: '', read: [], write: [] },
			call: (args) => update(ctx(), args)
		},
		set_password: {
			args: { username: '', password: '' },
			call: (args) => set_password(ctx(), args)
		},
		delete: {
			args: { username: '' },
			call: (args) => remove(ctx(), args)
		}
	})
};
