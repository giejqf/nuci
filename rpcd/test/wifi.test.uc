// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, ok, here, done } from 'harness';
import { ubus_stub, uci_stub } from 'stubs';
import { readfile } from 'fs';
import { wifi_stats, assoc_list_enriched, scan, parse_iw_dev, parse_iw_scan } from 'nuci.wifi';

const ROOT = here() + '/fixtures/root';

test('wifi_stats merges iwinfo info with the station count', () => {
	let ubus = ubus_stub({
		'iwinfo.devices': { devices: [ 'phy0-ap0' ] },
		'iwinfo.info': { ssid: 'OpenWrt', mode: 'Master', channel: 6, frequency: 2437, signal: -40, noise: -95, bitrate: 72200, quality: 70, quality_max: 70, txpower: 20 },
		'iwinfo.assoclist': { results: [ { mac: '00:11:22:33:44:55' }, { mac: '00:11:22:33:44:66' } ] },
	});
	eq(wifi_stats({ ubus }), { 'phy0-ap0': {
		ssid: 'OpenWrt', mode: 'Master', channel: 6, frequency: 2437, signal: -40, noise: -95,
		bitrate: 72200, quality: 70, quality_max: 70, txpower: 20, stations: 2
	} });
});

test('wifi_stats is empty without wireless', () => {
	eq(wifi_stats({ ubus: ubus_stub({ 'iwinfo.devices': { devices: [] } }) }), {});
	eq(wifi_stats({ ubus: ubus_stub({}) }), {});
});

test('assoc_list_enriched adds hostnames and addresses from leases', () => {
	let ubus = ubus_stub({
		'iwinfo.devices': { devices: [ 'phy0-ap0' ] },
		'iwinfo.info': { ssid: 'nuci-ap' },
		'iwinfo.assoclist': { results: [ { mac: '52:54:00:12:34:56', signal: -40, noise: -95, inactive: 10, connected_time: 60, rx: { rate: 72200, bytes: 100 }, tx: { rate: 65000, bytes: 200 } } ] },
	});
	let st = assoc_list_enriched({ root: ROOT, ubus, uci: uci_stub({ dhcp: {} }) });
	eq(st, [ {
		device: 'phy0-ap0', ssid: 'nuci-ap', mac: '52:54:00:12:34:56', hostname: 'laptop',
		ipv4: [ '192.168.1.100' ], ipv6: [], signal: -40, noise: -95, inactive: 10, connected_time: 60,
		rx_rate: 72200, tx_rate: 65000, rx_bytes: 100, tx_bytes: 200
	} ]);
});

test('scan uses the radio directly when it can scan', () => {
	let ubus = ubus_stub({ 'iwinfo.scan': { results: [ { ssid: 'x' } ] } });
	eq(scan({ ubus }, 'radio1'), { results: [ { ssid: 'x' } ] });
	eq(scan({ ubus }, 'radio1; reboot'), 2);
});

test('scan creates and removes a temporary managed interface on AP-only radios', () => {
	let n = 0;
	let calls = [];
	let ubus = {
		call: (o, m, a) => {
			push(calls, [ o, m, a ]);
			if (m == 'phyname') return { phyname: 'phy0' };
			if (m == 'scan') return (a.device == 'nuci-scan0') ? { results: [ { ssid: 'nuci-ap' } ] } : { results: [] };
		}
	};
	let ran = [];
	let r = scan({ ubus, iw: true, run: (argv) => (push(ran, argv), '') }, 'radio0');
	eq(r, { results: [ { ssid: 'nuci-ap' } ] });
	eq(ran, [
		[ 'iw', 'phy', 'phy0', 'interface', 'add', 'nuci-scan0', 'type', 'managed' ],
		[ 'ip', 'link', 'set', 'nuci-scan0', 'up' ],
		[ 'iw', 'dev', 'nuci-scan0', 'del' ],
	]);
	eq(scan({ ubus: ubus_stub({ 'iwinfo.scan': { results: [] } }) }, 'radio9'), 4);
});

test('parse_iw_dev maps interfaces to phys and types', () => {
	eq(parse_iw_dev(readfile(here() + '/fixtures/iw/dev.txt')), [
		{ phy: 'phy1', ifname: 'phy1-sta0', type: 'managed' },
		{ phy: 'phy0', ifname: 'phy0-ap0', type: 'AP' },
	]);
});

test('parse_iw_scan produces iwinfo-like results', () => {
	eq(parse_iw_scan(readfile(here() + '/fixtures/iw/scan.txt')), [
		{ bssid: '02:00:00:00:00:00', encryption: { enabled: true, wpa: [ 2 ], ciphers: [ 'ccmp' ], authentication: [ 'psk' ] },
		  frequency: 2437, signal: -30, ssid: 'nuci-ap', channel: 6 },
		{ bssid: 'AA:BB:CC:DD:EE:FF', encryption: { enabled: false }, frequency: 5180, signal: -71, ssid: 'open-net', channel: 36 },
	]);
});

done();
