// SPDX-License-Identifier: Apache-2.0
//
// System collectors for the nuci.system plugin.

'use strict';

import { access } from 'fs';
import { context, read, read_int, read_trim, list, lines } from 'nuci.util';
import { zones } from 'nuci.zoneinfo';

function timezones() {
	return zones;
}

function system_section(ctx) {
	let name = null;

	ctx.uci?.foreach('system', 'system', s => { name ??= s['.name']; });

	return name;
}

function localtime(ctx) {
	ctx = context(ctx);

	let s = system_section(ctx);

	return {
		localtime: time(),
		zonename: (s && ctx.uci.get('system', s, 'zonename')) ?? 'UTC',
		timezone: (s && ctx.uci.get('system', s, 'timezone')) ?? 'UTC0',
	};
}

// Returns true on success. `epoch` must be a positive 32-bit integer.
function set_localtime(ctx, epoch) {
	ctx = context(ctx);

	if (type(epoch) != 'int' || epoch <= 0 || epoch > 0xffffffff)
		return false;

	return ctx.run([ 'date', '-s', `@${epoch}` ]) != null;
}

function parse_trigger(text) {
	let current = 'none', all = [];

	for (let t in split(trim(text ?? ''), /\s+/)) {
		let m = match(t, /^\[(.+)\]$/);

		if (m)
			current = t = m[1];

		if (length(t))
			push(all, t);
	}

	return { trigger: current, triggers: all };
}

function leds(ctx) {
	ctx = context(ctx);

	let out = [];

	for (let name in list(ctx, '/sys/class/leds')) {
		let base = `/sys/class/leds/${name}`;
		let t = parse_trigger(read(ctx, `${base}/trigger`));

		push(out, {
			name,
			brightness: read_int(ctx, `${base}/brightness`) ?? 0,
			max_brightness: read_int(ctx, `${base}/max_brightness`) ?? 1,
			trigger: t.trigger,
			triggers: t.triggers,
		});
	}

	return out;
}

// `block info`: /dev/sda1: UUID="..." LABEL="..." TYPE="vfat"
function parse_block_info(text) {
	let out = [];

	for (let l in lines(text)) {
		let m = match(l, /^([^:]+):\s*(.*)$/);

		if (!m)
			continue;

		let dev = { device: m[1] };

		for (let kv in match(m[2], /([A-Z]+)="([^"]*)"/g) ?? [])
			dev[lc(kv[1])] = kv[2];

		push(out, dev);
	}

	return out;
}

function parse_mounts(text) {
	let out = {};

	for (let l in lines(text)) {
		let f = split(l, ' ');

		if (length(f) >= 4)
			out[f[1]] = { device: f[0], mount: f[1], type: f[2], options: split(f[3], ',') };
	}

	return out;
}

function block_devices(ctx) {
	ctx = context(ctx);

	let out;

	if (ctx.root == '' && access('/sbin/block'))
		out = parse_block_info(ctx.run([ '/sbin/block', 'info' ]));
	else if (ctx.root != '' && read(ctx, '/cmd/block-info') != null)
		out = parse_block_info(read(ctx, '/cmd/block-info'));

	if (out) {
		for (let d in out) {
			let size = read_int(ctx, `/sys/class/block/${replace(d.device, /^\/dev\//, '')}/size`);

			if (size != null)
				d.size = size * 512;
		}

		return out;
	}

	// No block-mount installed: list block devices from sysfs.
	let mounts = parse_mounts(read(ctx, '/proc/mounts'));
	let bydev = {};

	for (let mp, m in mounts)
		bydev[m.device] = mp;

	out = [];

	for (let name in list(ctx, '/sys/class/block')) {
		if (match(name, /^(loop|ram|zram|mtdblock)/))
			continue;

		let dev = { device: `/dev/${name}`, size: (read_int(ctx, `/sys/class/block/${name}/size`) ?? 0) * 512 };

		if (bydev[dev.device])
			dev.mount = bydev[dev.device];

		push(out, dev);
	}

	return out;
}

// `df -kP` + /proc/mounts
function parse_df(text) {
	let out = [];

	for (let l in slice(lines(text), 1)) {
		let f = split(trim(l), /\s+/);

		if (length(f) >= 6)
			push(out, { device: f[0], size: +f[1], used: +f[2], avail: +f[3], mount: join(' ', slice(f, 5)) });
	}

	return out;
}

function mount_points(ctx) {
	ctx = context(ctx);

	let mounts = parse_mounts(read(ctx, '/proc/mounts'));
	let df = (ctx.root == '') ? ctx.run([ 'df', '-kP' ]) : read(ctx, '/cmd/df');
	let out = [];

	for (let e in parse_df(df)) {
		let m = mounts[e.mount];

		push(out, { ...e, type: m?.type ?? 'unknown', options: m?.options ?? [] });
	}

	return out;
}

function usb_devices(ctx) {
	ctx = context(ctx);

	let out = [];

	for (let name in list(ctx, '/sys/bus/usb/devices')) {
		let base = `/sys/bus/usb/devices/${name}`;
		let vendor = read_trim(ctx, `${base}/idVendor`);

		if (!vendor)
			continue;

		let dev = {
			bus: read_int(ctx, `${base}/busnum`) ?? 0,
			device: read_int(ctx, `${base}/devnum`) ?? 0,
			vendor_id: vendor,
			product_id: read_trim(ctx, `${base}/idProduct`) ?? '',
		};

		for (let k in [ 'manufacturer', 'product', 'speed' ]) {
			let v = read_trim(ctx, `${base}/${k}`);

			if (v != null)
				dev[k] = v;
		}

		push(out, dev);
	}

	return out;
}

export {
	timezones, localtime, set_localtime, parse_trigger, leds, parse_block_info,
	block_devices, parse_mounts, parse_df, mount_points, usb_devices
};
