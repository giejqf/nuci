// SPDX-License-Identifier: Apache-2.0
//
// nuci.sqm — active shaping per interface (nuci-app-sqm).

'use strict';

import { cursor } from 'uci';
import { methods } from 'nuci.rpc';
import { status } from 'nuci.app.sqm';

return {
	'nuci.sqm': methods({
		status: { call: () => status({ uci: cursor() }) }
	})
};
