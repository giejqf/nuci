// SPDX-License-Identifier: Apache-2.0
//
// nuci.wol — Wake on LAN with etherwake (nuci-app-wol).

'use strict';

import { methods } from 'nuci.rpc';
import { interfaces, wake } from 'nuci.app.wol';

return {
	'nuci.wol': methods({
		interfaces: { call: () => interfaces() },
		wake: {
			args: { mac: 'aa:bb:cc:dd:ee:ff', interface: 'br-lan', broadcast: true, password: 'AABBCCDDEEFF' },
			call: (args) => wake(null, args)
		}
	})
};
