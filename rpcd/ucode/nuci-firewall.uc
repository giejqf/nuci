// SPDX-License-Identifier: Apache-2.0
//
// nuci.firewall — fw4 ruleset preview (from the committed config) and the
// live nftables ruleset. Read-only; changes go through uci + apply.

'use strict';

import { methods } from 'nuci.rpc';
import { preview, ruleset } from 'nuci.firewall';

return {
	'nuci.firewall': methods({
		preview: { call: () => preview() },
		ruleset: { call: () => ruleset() }
	})
};
