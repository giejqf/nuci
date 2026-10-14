// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-wol: send Wake-on-LAN magic packets with etherwake, and list the
// Ethernet interfaces a packet can leave on.

'use strict';

import { access, lsdir, readlink } from 'fs';
import { context, read_trim, read_int } from 'nuci.util';
import { STATUS } from 'nuci.rpc';

const PROGRAMS = [ '/usr/bin/etherwake', '/usr/bin/ether-wake' ];
const NET = '/sys/class/net';
const ARPHRD_ETHER = 1;
const IFNAME_RE = /^[A-Za-z0-9_.-]{1,15}$/;

// "aabbcc" -> "aa:bb:cc"
function colons(hex) {
	return join(':', map(match(hex, /../g), m => m[0]));
}

function program(ctx) {
	for (let p in PROGRAMS)
		if (access(ctx.root + p, 'x'))
			return p;

	return null;
}

// "AA-BB-CC-DD-EE-FF", "aabb.ccdd.eeff" or "aabbccddeeff" -> "aa:bb:cc:dd:ee:ff"
function normalize_mac(s) {
	if (type(s) != 'string')
		return null;

	let hex = lc(replace(s, /[:.-]/g, ''));

	if (!match(hex, /^[0-9a-f]{12}$/) || hex == '000000000000' || hex == 'ffffffffffff')
		return null;

	return colons(hex);
}

// SecureOn password: 4 or 6 bytes in hex (etherwake's uci form is
// "AABBCCDDEEFF") or a dotted IPv4 form; "" means none. false = invalid.
function normalize_password(s) {
	if (s == null || s == '')
		return null;

	if (type(s) != 'string')
		return false;

	let dotted = match(s, /^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/);

	if (dotted)
		return (length(filter(slice(dotted, 1), n => +n > 255)) == 0) ? s : false;

	let hex = lc(replace(s, /[:-]/g, ''));

	if (!match(hex, /^[0-9a-f]+$/) || (length(hex) != 8 && length(hex) != 12))
		return false;

	return colons(hex);
}

// Ethernet-type interfaces (bridges, ports, VLANs, Wi-Fi), loopback excluded.
function interfaces(ctx) {
	ctx = context(ctx);

	let out = [];

	for (let name in sort(lsdir(ctx.root + NET) ?? [])) {
		let dir = `${ctx.root}${NET}/${name}`;

		if (!match(name, IFNAME_RE) || read_int(ctx, `${NET}/${name}/type`) != ARPHRD_ETHER)
			continue;

		let state = read_trim(ctx, `${NET}/${name}/operstate`);
		let master = readlink(`${dir}/master`);

		push(out, {
			name,
			mac: read_trim(ctx, `${NET}/${name}/address`),
			up: state == 'up' || state == 'unknown',
			bridge: access(`${dir}/bridge`) == true,
			master: master ? replace(master, /^.*\//, '') : null,
		});
	}

	return { program: program(ctx), interfaces: out };
}

function wake(ctx, args) {
	ctx = context(ctx);

	let mac = normalize_mac(args.mac);
	let password = normalize_password(args.password);
	let iface = args.interface;

	if (!mac || password === false || type(iface) != 'string' || !match(iface, IFNAME_RE))
		return STATUS.INVALID_ARGUMENT;

	if (!length(filter(interfaces(ctx).interfaces, i => i.name == iface)))
		return STATUS.NOT_FOUND;

	let prog = program(ctx);

	if (!prog)
		return STATUS.NOT_SUPPORTED;

	let argv = [ prog, '-i', iface ];

	if (args.broadcast)
		push(argv, '-b');

	if (password)
		push(argv, '-p', password);

	push(argv, mac);

	let rc = ctx.spawn(argv);

	return (rc == 0) ? { sent: true, mac, interface: iface } : STATUS.UNKNOWN_ERROR;
}

export { normalize_mac, normalize_password, interfaces, wake };
