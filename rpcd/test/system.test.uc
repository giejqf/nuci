// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, ok, here, done } from 'harness';
import { uci_stub } from 'stubs';
import {
	timezones, localtime, set_localtime, leds, block_devices, mount_points, usb_devices, parse_trigger,
	setup_status
} from 'nuci.system';

const ROOT = here() + '/fixtures/root';

test('timezones maps zone names to POSIX TZ strings', () => {
	let z = timezones();
	eq(z['UTC'], 'UTC0');
	eq(z['Europe/Berlin'], 'CET-1CEST,M3.5.0,M10.5.0/3');
	ok(length(keys(z)) > 300);
});

test('localtime reads zone settings from the first system section', () => {
	let uci = uci_stub({ system: { cfg01: { '.type': 'system', zonename: 'Europe/Berlin', timezone: 'CET-1CEST,M3.5.0,M10.5.0/3' } } });
	let lt = localtime({ uci });
	eq(lt.zonename, 'Europe/Berlin');
	ok(lt.localtime >= time() - 5 && lt.localtime <= time());
	eq(localtime({ uci: uci_stub({}) }).zonename, 'UTC');
});

test('set_localtime validates input and runs date -s @epoch without a shell', () => {
	let ran = [];
	let run = (argv) => { push(ran, argv); return ''; };
	ok(set_localtime({ run }, 1791800000));
	eq(ran, [ [ 'date', '-s', '@1791800000' ] ]);
	ok(!set_localtime({ run }, -5));
	ok(!set_localtime({ run }, '1791800000; reboot'));
	eq(length(ran), 1);
});

test('leds parse the bracketed active trigger', () => {
	eq(parse_trigger('none [timer] heartbeat'), { trigger: 'timer', triggers: [ 'none', 'timer', 'heartbeat' ] });
	eq(leds({ root: ROOT }), [ {
		name: 'green:lan', brightness: 0, max_brightness: 1, trigger: 'netdev',
		triggers: [ 'none', 'timer', 'netdev', 'heartbeat', 'default-on' ]
	} ]);
});

test('block_devices parses block info and adds sizes', () => {
	let d = block_devices({ root: ROOT });
	eq(d[0], { device: '/dev/sda1', uuid: '1234-ABCD', label: 'BOOT', version: 'FAT16', type: 'vfat', size: 33280 * 512 });
	eq(d[1].mount, '/rom');
});

test('mount_points joins df with /proc/mounts', () => {
	let m = mount_points({ root: ROOT });
	let tmp = filter(m, x => x.mount == '/tmp')[0];
	eq(tmp.type, 'tmpfs');
	eq(tmp.size, 247224);
	ok('nosuid' in tmp.options);
	eq(filter(m, x => x.mount == '/')[0].type, 'overlay');
});

test('usb_devices lists devices with vendor ids', () => {
	eq(usb_devices({ root: ROOT }), [ {
		bus: 1, device: 2, vendor_id: '0bda', product_id: '8153',
		manufacturer: 'Realtek', product: 'USB 10/100/1000 LAN', speed: '5000'
	} ]);
});

test('setup_status reports whether root has a password', () => {
	let at = (name) => setup_status({ root: here() + '/fixtures/setup/' + name });
	eq(at('fresh'), { root_password: false });
	eq(at('set'), { root_password: true });
	// locked (no login possible) is not "unset"
	eq(at('locked'), { root_password: true });
	eq(at('missing'), { root_password: true });
});

done();
