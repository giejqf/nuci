// SPDX-License-Identifier: Apache-2.0
'use strict';

import { readfile } from 'fs';
import { test, eq, ok, here, done } from 'harness';
import { run_stub, ubus_stub } from 'stubs';
import {
	realtime, processes, kernel_log, conntrack, parse_conntrack, parse_dmesg, parse_proc_stat,
	conntrack_summary, cpu_total, syslog, signal
} from 'nuci.status';

const ROOT = here() + '/fixtures/root';
const ctx = { root: ROOT, run: run_stub(ROOT, { 'dmesg -r': readfile(ROOT + '/cmd/dmesg') }) };

test('realtime reads load, cpu, memory, interfaces and conntrack', () => {
	let r = realtime(ctx);
	eq(r.load, [ 0, 0.03, 0 ]);
	eq(r.uptime, 3524.62);
	eq(r.cpu.user, 17830);
	eq(r.cpu.idle, 323563);
	eq(r.memory.total, 494448 * 1024);
	eq(r.memory.available, 415160 * 1024);
	eq(r.interfaces['br-lan'], { rx_bytes: 879634, rx_packets: 4826, tx_bytes: 735688, tx_packets: 4246 });
	ok(r.interfaces.eth1.rx_bytes == 3370228);
	eq(r.conntrack, { count: 3, max: 31232 });
});

test('processes parses stat/status/cmdline and resolves users', () => {
	let p = processes(ctx);
	let byPid = {};
	for (let x in p) byPid[x.pid] = x;
	eq(byPid[2561].command, '/usr/sbin/dnsmasq -C /var/etc/dnsmasq.conf.cfg01411c -k -x /var/run/dnsmasq/dnsmasq.cfg01411c.pid');
	eq(byPid[2561].ppid, 2551);
	eq(byPid[2561].cpu_ticks, 57);
	eq(byPid[2561].state, 'S');
	eq(byPid[1].user, 'root');
	ok(match(byPid[2].command, /^\[.+\]$/), 'kernel threads show [name]');
	eq(map(p, x => x.pid), sort(map(p, x => x.pid), (a, b) => a - b));
});

test('parse_proc_stat handles comm with spaces and parens', () => {
	eq(parse_proc_stat('42 (a (b) c) R 7 1 1 0 -1 0 0 0 0 0 5 6 0 0'), { state: 'R', ppid: 7, cpu_ticks: 11 });
	eq(parse_proc_stat('garbage'), null);
});

test('kernel_log parses priority, facility and continuation lines', () => {
	let log = kernel_log(ctx);
	ok(length(log) > 10);
	eq(log[0].priority, 5);
	eq(log[0].facility, 0);
	ok(log[0].time == 0);
	ok(match(log[0].msg, /^Linux version/));
	eq(parse_dmesg('<14>[   12.5] hello\n  world\n<3>[13.000001] err'), [
		{ time: 12.5, facility: 1, priority: 6, msg: 'hello\n  world' },
		{ time: 13.000001, facility: 0, priority: 3, msg: 'err' }
	]);
});

test('conntrack uses the original direction and sums counters', () => {
	let c = conntrack(ctx);
	eq(length(c), 3);
	eq([ c[0].family, c[0].protocol, c[0].state, c[0].dst, c[0].dport ], [ 'ipv4', 'tcp', 'ESTABLISHED', '192.168.1.1', 22 ]);
	ok(c[1].state == null && c[1].dport == 123);
	let line = 'ipv4     2 tcp      6 7440 ESTABLISHED src=192.168.1.2 dst=192.168.1.1 sport=50000 dport=22 packets=10 bytes=1000 src=192.168.1.1 dst=192.168.1.2 sport=22 dport=50000 packets=8 bytes=2000 [ASSURED] mark=0 zone=0 use=2';
	eq(parse_conntrack(line), [ {
		family: 'ipv4', protocol: 'tcp', timeout: 7440, bytes: 3000, packets: 18, state: 'ESTABLISHED',
		src: '192.168.1.2', dst: '192.168.1.1', sport: 50000, dport: 22
	} ]);
	eq(length(parse_conntrack(line + '\n' + line + '\n' + line, 2)), 2);
});

test('kernel_log filters by time cursor', () => {
	let c = { run: run_stub(null, { 'dmesg -r': '<6>[    1.000000] a\n<6>[    2.500000] b\n<4>[   10.250000] c\n' }) };
	eq(map(kernel_log(c), e => e.msg), [ 'a', 'b', 'c' ]);
	eq(map(kernel_log(c, 2.5), e => e.msg), [ 'c' ]);
	eq(kernel_log(c, 10.25), []);
});

test('syslog returns logd entries after the cursor', () => {
	let ubus = ubus_stub({ 'log.read': { log: [ { id: 5, msg: 'a' }, { id: 6, msg: 'b' }, { id: 7, msg: 'c' } ] } });
	eq(map(syslog({ ubus }, 5), e => e.id), [ 6, 7 ]);
	eq(length(syslog({ ubus })), 3);
	eq(ubus.calls[0], [ 'log', 'read', { lines: 200, stream: false, oneshot: true } ]);
});

test('conntrack_summary counts by protocol', () => {
	eq(conntrack_summary(ctx), { total: 3, tcp: 2, udp: 1, icmp: 0, other: 0, max: 31232 });
});

test('cpu_total sums all jiffy columns', () => {
	eq(cpu_total('cpu  1 2 3 4 5 6 7 8 0 0\n'), 36);
});

test('signal validates pid and signal and calls kill without a shell', () => {
	let ran = [];
	let c = { root: ROOT, run: (argv) => { push(ran, argv); return ''; } };
	eq(signal(c, 2561, 15), 0);
	eq(ran, [ [ 'kill', '-15', '2561' ] ]);
	eq(signal(c, 1, 15), 2, 'pid 1 refused');
	eq(signal(c, 2561, 3), 2, 'signal not in allowlist');
	eq(signal(c, '2561', 15), 2, 'pid must be an integer');
	eq(signal(c, 99999, 9), 4, 'missing process');
	eq(length(ran), 1);
});

done();
