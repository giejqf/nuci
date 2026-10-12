// SPDX-License-Identifier: Apache-2.0
//
// DHCP leases and known hosts: dnsmasq lease file (IPv4 and dnsmasq DHCPv6)
// merged with odhcpd's `dhcp ipv6leases`.

'use strict';

import { context, read, lines } from 'nuci.util';

const DEFAULT_LEASEFILE = '/tmp/dhcp.leases';

function leasefile(ctx) {
	let path = null;

	ctx.uci?.foreach('dhcp', 'dnsmasq', s => { path ??= s.leasefile; });

	return path ?? DEFAULT_LEASEFILE;
}

// dnsmasq format: v4 "expiry mac ip hostname clientid"; after a "duid <id>"
// line, v6 "expiry iaid ip hostname clientduid". Expiry 0 = infinite.
function parse_dnsmasq_leases(text, now) {
	let out = [];
	let v6 = false;

	for (let l in lines(text)) {
		let f = split(trim(l), /\s+/);

		if (f[0] == 'duid') {
			v6 = true;
			continue;
		}

		if (length(f) < 4)
			continue;

		let exp = +f[0];
		let lease = {
			family: v6 ? 'ipv6' : 'ipv4',
			address: f[2],
			expires: (exp == 0) ? -1 : max(0, exp - now),
		};

		if (f[3] != '*')
			lease.hostname = f[3];

		if (v6) {
			if (f[4] && f[4] != '*')
				lease.duid = f[4];
		}
		else {
			lease.macaddr = lc(f[1]);
		}

		push(out, lease);
	}

	return out;
}

function odhcpd_leases(ctx) {
	let out = [];
	let res = ctx.ubus?.call('dhcp', 'ipv6leases', {});

	for (let ifname, dev in res?.device ?? {}) {
		for (let l in dev.leases ?? []) {
			for (let a in [ ...(l['ipv6-addr'] ?? []), ...(l['ipv6-prefix'] ?? []) ]) {
				let lease = {
					family: 'ipv6',
					address: a.address + ((a['prefix-length'] && a['prefix-length'] < 128) ? `/${a['prefix-length']}` : ''),
					duid: l.duid,
					expires: (l.valid < 0 || l.valid == null) ? -1 : l.valid,
					interface: ifname,
				};

				if (length(l.hostname))
					lease.hostname = l.hostname;

				push(out, lease);
			}
		}
	}

	return out;
}

function leases(ctx) {
	ctx = context(ctx);

	return [ ...parse_dnsmasq_leases(read(ctx, leasefile(ctx)), time()), ...odhcpd_leases(ctx) ];
}

// /proc/net/arp: "IP address HW type Flags HW address Mask Device"
function parse_arp(text) {
	let out = [];

	for (let l in slice(lines(text), 1)) {
		let f = split(trim(l), /\s+/);

		if (length(f) >= 6 && f[3] != '00:00:00:00:00:00')
			push(out, { address: f[0], macaddr: lc(f[3]), device: f[5] });
	}

	return out;
}

function parse_ethers(text) {
	let out = [];

	for (let l in lines(text)) {
		l = trim(l);

		if (substr(l, 0, 1) == '#')
			continue;

		let f = split(l, /\s+/);

		if (length(f) >= 2 && match(f[0], /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/))
			push(out, { macaddr: lc(f[0]), name: f[1] });
	}

	return out;
}

function is_ipv4(s) {
	return match(s, /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) != null;
}

// Known hosts by MAC: static leases, ethers, leases and the ARP table.
function hosts(ctx) {
	ctx = context(ctx);

	let byMac = {};
	let host = (mac) => (byMac[mac] ??= { macaddr: mac, ipv4: [], ipv6: [] });
	let addip = (h, ip) => {
		let fam = is_ipv4(ip) ? 'ipv4' : 'ipv6';

		if (!(ip in h[fam]))
			push(h[fam], ip);
	};

	ctx.uci?.foreach('dhcp', 'host', s => {
		for (let mac in ((type(s.mac) == 'array') ? s.mac : split(s.mac ?? '', /\s+/))) {
			if (!length(mac))
				continue;

			let h = host(lc(mac));

			if (s.name)
				h.hostname ??= s.name;

			if (s.ip)
				addip(h, s.ip);
		}
	});

	for (let e in parse_ethers(read(ctx, '/etc/ethers')))
		host(e.macaddr).hostname ??= e.name;

	for (let l in parse_dnsmasq_leases(read(ctx, leasefile(ctx)), time())) {
		if (!l.macaddr)
			continue;

		let h = host(l.macaddr);

		if (l.hostname)
			h.hostname ??= l.hostname;

		addip(h, l.address);
	}

	for (let a in parse_arp(read(ctx, '/proc/net/arp')))
		addip(host(a.macaddr), a.address);

	return sort(values(byMac), (a, b) => (a.macaddr < b.macaddr) ? -1 : 1);
}

export { leasefile, parse_dnsmasq_leases, odhcpd_leases, leases, parse_arp, parse_ethers, hosts };
