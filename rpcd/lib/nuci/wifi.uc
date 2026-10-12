// SPDX-License-Identifier: Apache-2.0
//
// Wireless statistics from rpcd-mod-iwinfo, for the `wifi` SSE stream and
// the realtime graphs.

'use strict';

import { access } from 'fs';
import { context } from 'nuci.util';
import { hosts } from 'nuci.dhcp';

const RADIO_RE = /^[A-Za-z0-9_]{1,32}$/;
const SCAN_IFACE = 'nuci-scan0';

function wifi_stats(ctx) {
	ctx = context(ctx);

	let out = {};

	for (let dev in ctx.ubus?.call('iwinfo', 'devices', {})?.devices ?? []) {
		let i = ctx.ubus.call('iwinfo', 'info', { device: dev }) ?? {};
		let a = ctx.ubus.call('iwinfo', 'assoclist', { device: dev })?.results ?? [];

		out[dev] = {
			ssid: i.ssid, mode: i.mode, channel: i.channel, frequency: i.frequency,
			signal: i.signal, noise: i.noise, bitrate: i.bitrate,
			quality: i.quality, quality_max: i.quality_max, txpower: i.txpower,
			stations: length(a),
		};
	}

	return out;
}

// MAC -> known host (hostnames and addresses from the DHCP/ARP view).
function known_hosts(ctx) {
	let known = {};

	for (let h in hosts(ctx))
		known[h.macaddr] = h;

	return known;
}

// One interface's iwinfo assoclist results, enriched with host data.
function merge_stations(dev, info, results, known) {
	let out = [];

	for (let st in results ?? []) {
		let mac = lc(st.mac ?? '');
		let h = known[mac];

		push(out, {
			device: dev, ssid: info?.ssid, mac,
			hostname: h?.hostname, ipv4: h?.ipv4 ?? [], ipv6: h?.ipv6 ?? [],
			signal: st.signal, noise: st.noise, inactive: st.inactive,
			connected_time: st.connected_time,
			rx_rate: st.rx?.rate, tx_rate: st.tx?.rate,
			rx_bytes: st.rx?.bytes, tx_bytes: st.tx?.bytes,
		});
	}

	return out;
}

// Synchronous variant for callers outside rpcd (rpcd itself hosts iwinfo, so
// the nuci.wifi plugin chains deferred calls instead; see nuci-wifi.uc).
function assoc_list_enriched(ctx) {
	ctx = context(ctx);

	let known = known_hosts(ctx);
	let out = [];

	for (let dev in ctx.ubus?.call('iwinfo', 'devices', {})?.devices ?? []) {
		let info = ctx.ubus.call('iwinfo', 'info', { device: dev }) ?? {};

		push(out, ...merge_stations(dev, info, ctx.ubus.call('iwinfo', 'assoclist', { device: dev })?.results, known));
	}

	return out;
}

// `iw dev` -> [ { phy: 'phy0', ifname, type } ]
function parse_iw_dev(text) {
	let out = [], phy = null, cur = null;

	for (let l in split(text ?? '', '\n')) {
		let m;

		if ((m = match(l, /^phy#([0-9]+)/)))
			phy = `phy${m[1]}`;
		else if ((m = match(l, /^\s+Interface (\S+)/)))
			push(out, (cur = { phy, ifname: m[1] }));
		else if (cur && (m = match(l, /^\s+type (.+)$/)))
			cur.type = trim(m[1]);
	}

	return out;
}

// `iw dev X scan` -> results shaped like iwinfo's scan list.
function parse_iw_scan(text) {
	let out = [], bss = null;

	for (let l in split(text ?? '', '\n')) {
		let m;

		if ((m = match(l, /^BSS ([0-9a-fA-F:]{17})/))) {
			push(out, (bss = { bssid: uc(m[1]), encryption: { enabled: false } }));
			continue;
		}

		if (!bss)
			continue;

		if ((m = match(l, /^\s+freq: ([0-9.]+)/)))
			bss.frequency = int(+m[1]);
		else if ((m = match(l, /^\s+signal: (-?[0-9.]+) dBm/)))
			bss.signal = int(+m[1]);
		else if ((m = match(l, /^\s+SSID: (.*)$/)))
			bss.ssid = m[1];
		else if ((m = match(l, /^\s+DS Parameter set: channel ([0-9]+)/)) || (m = match(l, /primary channel: ([0-9]+)/)))
			bss.channel ??= +m[1];
		else if (match(l, /^\s+(RSN|WPA):/)) {
			bss.encryption.enabled = true;
			bss.encryption.wpa ??= [];
			push(bss.encryption.wpa, match(l, /RSN/) ? 2 : 1);
		}
		else if ((m = match(l, /Authentication suites: (.+)$/))) {
			bss.encryption.authentication = uniq(map(split(trim(m[1]), ' '), a =>
				(a == 'PSK' || a == 'PSK/SHA-256') ? 'psk' : (a == 'SAE') ? 'sae' : (a == 'OWE') ? 'owe' : '802.1x'));
		}
		else if ((m = match(l, /Pairwise ciphers: (.+)$/))) {
			bss.encryption.ciphers = map(split(trim(m[1]), ' '), lc);
		}
		else if (match(l, /^\s+capability:.*Privacy/) && !bss.encryption.enabled) {
			bss.encryption.enabled = true; // WEP
		}
	}

	return out;
}

// Scan from a radio. AP-only radios cannot scan, so when the radio has no
// usable interface a temporary managed one is created with `iw` (if present).
// Returns { results } or a ubus status code.
function scan(ctx, radio) {
	ctx = context(ctx);

	if (type(radio) != 'string' || !match(radio, RADIO_RE))
		return 2;

	let res = ctx.ubus?.call('iwinfo', 'scan', { device: radio })?.results ?? [];

	if (length(res))
		return { results: res };

	let phy = ctx.ubus?.call('iwinfo', 'phyname', { section: radio })?.phyname;

	if (!phy)
		return 4;

	if (!(ctx.iw ?? access('/usr/sbin/iw')))
		return { results: [] };

	ctx.run([ 'iw', 'phy', phy, 'interface', 'add', SCAN_IFACE, 'type', 'managed' ]);
	ctx.run([ 'ip', 'link', 'set', SCAN_IFACE, 'up' ]);
	res = ctx.ubus.call('iwinfo', 'scan', { device: SCAN_IFACE })?.results ?? [];
	ctx.run([ 'iw', 'dev', SCAN_IFACE, 'del' ]);

	return { results: res };
}

export {
	wifi_stats, known_hosts, merge_stations, assoc_list_enriched, scan, parse_iw_dev, parse_iw_scan,
	RADIO_RE, SCAN_IFACE
};
