// SPDX-License-Identifier: Apache-2.0
//
// nuci.apps — installed nuci-app manifests for the SPA router.

'use strict';

import { methods } from 'nuci.rpc';
import { list_apps } from 'nuci.apps';

return {
	'nuci.apps': methods({
		list: {
			args: {},
			call: () => ({ apps: list_apps() })
		}
	})
};
