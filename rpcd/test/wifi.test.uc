// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, done } from 'harness';
import { ubus_stub } from 'stubs';
import { wifi_stats } from 'nuci.wifi';

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

done();
