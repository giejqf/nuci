// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, ok, done } from 'harness';
import { parse_dump, status, genkey, pubkey } from 'nuci.app.wireguard';

const PRIV = 'cGVyc29uYWwga2V5IGZvciB0ZXN0aW5nIG9ubHkhIUE=';
const PUB = 'aGVsbG8gd29ybGQgdGhpcyBpcyBhIHB1YmxpYyBrZXk=';
const DUMP = `wg0\t${PRIV}\t${PUB}\t51820\toff\n` +
	`wg0\t${PUB}\t(none)\t192.0.2.7:51821\t10.9.0.2/32,fd00:9::2/128\t1791790000\t1024\t2048\t25\n` +
	`wg0\t${PRIV}\tc2VjcmV0IHByZXNoYXJlZCBrZXkgZm9yIHRlc3RpbmdBRT=\t(none)\t(none)\t0\t0\t0\toff\n`;

test('dump parsing never returns private or preshared keys', () => {
	let s = parse_dump(DUMP);
	eq(s.wg0.public_key, PUB);
	eq(s.wg0.listen_port, 51820);
	eq(s.wg0.peers[0], {
		public_key: PUB, preshared_key: false, endpoint: '192.0.2.7:51821',
		allowed_ips: [ '10.9.0.2/32', 'fd00:9::2/128' ], latest_handshake: 1791790000,
		rx_bytes: 1024, tx_bytes: 2048, persistent_keepalive: 25,
	});
	eq(s.wg0.peers[1].preshared_key, true);
	eq(s.wg0.peers[1].endpoint, null);
	ok(index(sprintf('%J', s), 'c2VjcmV0') < 0, 'no psk in output');
});

test('status runs wg show all dump', () => {
	let ran = [];
	status({ run: (argv) => (push(ran, argv), DUMP) });
	eq(ran, [ [ 'wg', 'show', 'all', 'dump' ] ]);
});

test('keys: genkey derives the public key via stdin, invalid keys are refused', () => {
	let ran = [];
	let run = (argv) => (push(ran, argv), argv[0] == 'wg' ? `${PRIV}\n` : `${PUB}\n`);
	eq(genkey({ run }), { private_key: PRIV, public_key: PUB });
	eq(ran[1], [ 'sh', '-c', 'printf "%s" "$1" | wg pubkey', 'sh', PRIV ]);
	eq(pubkey({ run }, 'not-a-key; reboot'), 2);
	eq(genkey({ run: () => 'garbage' }), 8);
});

done();
