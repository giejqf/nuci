// SPDX-License-Identifier: Apache-2.0
//
// Wireless statistics from rpcd-mod-iwinfo, for the `wifi` SSE stream and
// the realtime graphs.

'use strict';

import { context } from 'nuci.util';

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

export { wifi_stats };
