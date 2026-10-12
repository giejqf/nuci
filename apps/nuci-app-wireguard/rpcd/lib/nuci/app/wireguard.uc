// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-wireguard: runtime status from `wg show all dump` (private keys
// never leave the router through it; preshared keys become a flag) and key
// generation with wireguard-tools.

'use strict';

import { STATUS } from 'nuci.rpc';
import { context } from 'nuci.util';

const KEY_RE = /^[A-Za-z0-9+\/]{42}[AEIMQUYcgkosw480]=$/;

function num(s) {
	let n = +s;
	return n == n ? n : 0;
}

/** Parse `wg show all dump` (tab separated; interface line has 5 fields, peers 9). */
function parse_dump(text) {
	let out = {};
	for (let line in split(text ?? '', '\n')) {
		let f = split(line, '\t');
		if (length(f) == 5) {
			out[f[0]] = {
				public_key: f[2],
				listen_port: num(f[3]),
				fwmark: f[4] == 'off' ? null : f[4],
				peers: [],
			};
		}
		else if (length(f) == 9 && out[f[0]]) {
			push(out[f[0]].peers, {
				public_key: f[1],
				preshared_key: f[2] != '(none)',
				endpoint: f[3] == '(none)' ? null : f[3],
				allowed_ips: f[4] == '(none)' ? [] : split(f[4], ','),
				latest_handshake: num(f[5]),
				rx_bytes: num(f[6]),
				tx_bytes: num(f[7]),
				persistent_keepalive: f[8] == 'off' ? 0 : num(f[8]),
			});
		}
	}
	return out;
}

function status(ctx) {
	let c = context(ctx);
	return { interfaces: parse_dump(c.run([ 'wg', 'show', 'all', 'dump' ])) };
}

function valid_key(k) {
	return type(k) == 'string' && match(k, KEY_RE) != null;
}

function pubkey(ctx, priv) {
	if (!valid_key(priv)) return STATUS.INVALID_ARGUMENT;
	let c = context(ctx);
	// The key reaches wg on stdin; "$1" is a positional parameter, never parsed.
	let pub = trim(c.run([ 'sh', '-c', 'printf "%s" "$1" | wg pubkey', 'sh', priv ]) ?? '');
	return valid_key(pub) ? { public_key: pub } : STATUS.UNKNOWN_ERROR;
}

function genkey(ctx) {
	let c = context(ctx);
	let priv = trim(c.run([ 'wg', 'genkey' ]) ?? '');
	if (!valid_key(priv)) return STATUS.NOT_SUPPORTED;
	let pub = pubkey(c, priv);
	return type(pub) == 'int' ? pub : { private_key: priv, public_key: pub.public_key };
}

function genpsk(ctx) {
	let c = context(ctx);
	let psk = trim(c.run([ 'wg', 'genpsk' ]) ?? '');
	return valid_key(psk) ? { preshared_key: psk } : STATUS.NOT_SUPPORTED;
}

export { parse_dump, status, genkey, genpsk, pubkey, valid_key };
