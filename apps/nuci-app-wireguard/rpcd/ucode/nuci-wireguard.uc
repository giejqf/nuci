// SPDX-License-Identifier: Apache-2.0
//
// nuci.wireguard — tunnel status and key generation (nuci-app-wireguard).

'use strict';

import { methods } from 'nuci.rpc';
import { status, genkey, genpsk, pubkey } from 'nuci.app.wireguard';

return {
	'nuci.wireguard': methods({
		status: { call: () => status() },
		genkey: { call: () => genkey() },
		genpsk: { call: () => genpsk() },
		pubkey: {
			args: { private_key: '' },
			call: (args) => pubkey(null, args.private_key)
		}
	})
};
