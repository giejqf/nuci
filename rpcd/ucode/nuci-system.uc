// SPDX-License-Identifier: Apache-2.0
//
// nuci.system — timezones, clock, LEDs, block devices, mounts, USB, backups,
// first-run state.

'use strict';

import { cursor } from 'uci';
import { methods, STATUS } from 'nuci.rpc';
import {
	timezones, localtime, set_localtime, leds, block_devices, mount_points, usb_devices,
	backup_create, backup_status, backup_restore, setup_status
} from 'nuci.system';

return {
	'nuci.system': methods({
		timezones: { call: () => ({ zones: timezones() }) },
		localtime: { call: () => localtime({ uci: cursor() }) },
		set_localtime: {
			// int32 on the wire: uhttpd encodes JSON integers that fit as INT32.
			args: { localtime: 0 },
			call: (args) => {
				if (type(args.localtime) != 'int' || args.localtime <= 0)
					return STATUS.INVALID_ARGUMENT;

				return set_localtime(null, args.localtime) ? { result: args.localtime } : STATUS.UNKNOWN_ERROR;
			}
		},
		leds: { call: () => ({ leds: leds() }) },
		block_devices: { call: () => ({ devices: block_devices() }) },
		mount_points: { call: () => ({ mounts: mount_points() }) },
		usb_devices: { call: () => ({ devices: usb_devices() }) },
		backup_create: { call: () => backup_create() },
		backup_status: { call: () => backup_status() },
		backup_restore: { call: () => backup_restore() },
		setup_status: { call: () => setup_status() }
	})
};
