// SPDX-License-Identifier: Apache-2.0
//
// Status collectors shared by the nuci.status plugin and the SSE handler.

'use strict';

import { context, read, read_int, read_trim, list, lines } from 'nuci.util';

const MAX_CONNTRACK = 2000;

function parse_loadavg(text) {
	let f = split(trim(text ?? ''), ' ');

	return [ +f[0] || 0, +f[1] || 0, +f[2] || 0 ];
}

// /proc/meminfo -> { Key: bytes }
function parse_meminfo(text) {
	let out = {};

	for (let l in lines(text)) {
		let m = match(l, /^([A-Za-z0-9_()]+):\s+([0-9]+)/);

		if (m)
			out[m[1]] = +m[2] * 1024;
	}

	return out;
}

function parse_cpu(text) {
	for (let l in lines(text)) {
		if (substr(l, 0, 4) != 'cpu ')
			continue;

		let f = map(split(trim(substr(l, 4)), /\s+/), n => +n);

		return {
			user: f[0] ?? 0, nice: f[1] ?? 0, system: f[2] ?? 0, idle: f[3] ?? 0,
			iowait: f[4] ?? 0, irq: f[5] ?? 0, softirq: f[6] ?? 0, steal: f[7] ?? 0,
		};
	}

	return null;
}

// /proc/net/dev -> { ifname: counters }
function parse_net_dev(text) {
	let out = {};

	for (let l in lines(text)) {
		let m = match(l, /^\s*([^:\s]+):\s*(.*)$/);

		if (!m)
			continue;

		let f = map(split(trim(m[2]), /\s+/), n => +n);

		out[m[1]] = {
			rx_bytes: f[0], rx_packets: f[1],
			tx_bytes: f[8], tx_packets: f[9],
		};
	}

	return out;
}

function realtime(ctx) {
	ctx = context(ctx);

	let mem = parse_meminfo(read(ctx, '/proc/meminfo'));

	return {
		uptime: +split(read_trim(ctx, '/proc/uptime') ?? '0', ' ')[0],
		load: parse_loadavg(read(ctx, '/proc/loadavg')),
		cpu: parse_cpu(read(ctx, '/proc/stat')),
		memory: {
			total: mem.MemTotal ?? 0,
			free: mem.MemFree ?? 0,
			available: mem.MemAvailable ?? mem.MemFree ?? 0,
			buffers: mem.Buffers ?? 0,
			cached: mem.Cached ?? 0,
			swap_total: mem.SwapTotal ?? 0,
			swap_free: mem.SwapFree ?? 0,
		},
		interfaces: parse_net_dev(read(ctx, '/proc/net/dev')),
		conntrack: {
			count: read_int(ctx, '/proc/sys/net/netfilter/nf_conntrack_count') ?? 0,
			max: read_int(ctx, '/proc/sys/net/netfilter/nf_conntrack_max') ?? 0,
		},
	};
}

function parse_passwd(text) {
	let users = {};

	for (let l in lines(text)) {
		let f = split(l, ':');

		if (length(f) > 2)
			users[f[2]] = f[0];
	}

	return users;
}

function parse_proc_status(text) {
	let out = {};

	for (let l in lines(text)) {
		let m = match(l, /^([A-Za-z]+):\s*(.*)$/);

		if (m)
			out[m[1]] = m[2];
	}

	return out;
}

// /proc/<pid>/stat: "pid (comm) state ppid ... utime stime ..." where comm may contain spaces.
function parse_proc_stat(text) {
	let i = rindex(text ?? '', ')');

	if (i < 0)
		return null;

	let f = split(trim(substr(text, i + 2)), ' ');

	// f[0] = state (field 3); utime/stime are fields 14/15
	return { state: f[0], ppid: +f[1], cpu_ticks: (+f[11] || 0) + (+f[12] || 0) };
}

function processes(ctx) {
	ctx = context(ctx);

	let users = parse_passwd(read(ctx, '/etc/passwd'));
	let out = [];

	for (let pid in list(ctx, '/proc')) {
		if (!match(pid, /^[0-9]+$/))
			continue;

		let st = parse_proc_stat(read(ctx, `/proc/${pid}/stat`));
		let status = parse_proc_status(read(ctx, `/proc/${pid}/status`));

		if (!st)
			continue;

		// NUL-separated argv; split() is NUL-safe where replace() and regexes are not.
		let cmdline = trim(join(' ', split(read(ctx, `/proc/${pid}/cmdline`) ?? '', '\u0000')));
		let uid = split(status.Uid ?? '0', /\s+/)[0];

		push(out, {
			pid: +pid,
			ppid: st.ppid,
			user: users[uid] ?? uid,
			state: st.state,
			rss: +(match(status.VmRSS ?? '', /^([0-9]+)/)?.[1] ?? 0),
			vsz: +(match(status.VmSize ?? '', /^([0-9]+)/)?.[1] ?? 0),
			cpu_ticks: st.cpu_ticks,
			command: length(cmdline) ? cmdline : `[${status.Name ?? '?'}]`,
		});
	}

	return sort(out, (a, b) => a.pid - b.pid);
}

// `dmesg -r`: "<pri>[ seconds] message"; continuation lines belong to the previous entry.
function parse_dmesg(text) {
	let out = [];

	for (let l in lines(text)) {
		let m = match(l, /^<([0-9]+)>\[\s*([0-9.]+)\] ?(.*)$/);

		if (m) {
			let pri = +m[1];
			push(out, { time: +m[2], facility: pri >> 3, priority: pri & 7, msg: m[3] });
		}
		else if (length(out)) {
			out[-1].msg += '\n' + l;
		}
	}

	return out;
}

function kernel_log(ctx) {
	ctx = context(ctx);

	return parse_dmesg(ctx.run([ 'dmesg', '-r' ]));
}

// /proc/net/nf_conntrack -> entries (original direction, both directions' counters summed)
function parse_conntrack(text, limit) {
	let out = [];

	for (let l in lines(text)) {
		if (length(out) >= (limit ?? MAX_CONNTRACK))
			break;

		let f = split(trim(l), /\s+/);
		let e = { family: f[0], protocol: f[2], timeout: +f[4], bytes: 0, packets: 0 };

		for (let i = 5; i < length(f); i++) {
			let kv = split(f[i], '=', 2);

			if (length(kv) != 2) {
				if (i == 5 && match(f[i], /^[A-Z_]+$/))
					e.state = f[i];

				continue;
			}

			let k = kv[0], v = kv[1];

			if ((k == 'src' || k == 'dst') && e[k] == null)
				e[k] = v;
			else if ((k == 'sport' || k == 'dport') && e[k] == null)
				e[k] = +v;
			else if (k == 'bytes' || k == 'packets')
				e[k] += +v;
		}

		if (e.src && e.dst)
			push(out, e);
	}

	return out;
}

function conntrack(ctx) {
	ctx = context(ctx);

	return parse_conntrack(read(ctx, '/proc/net/nf_conntrack'));
}

export {
	parse_loadavg, parse_meminfo, parse_cpu, parse_net_dev, realtime,
	parse_passwd, parse_proc_stat, parse_proc_status, processes,
	parse_dmesg, kernel_log, parse_conntrack, conntrack
};
