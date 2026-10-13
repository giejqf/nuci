// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, ok, here, done } from 'harness';
import { list_installed, list_available, search, info, lists, change, update, job_status } from 'nuci.pkg';
import { stat } from 'fs';
import { status, start } from 'nuci.job';
import { backup_status, backup_restore, backup_create } from 'nuci.system';

const ROOT = here() + '/fixtures/root';
const INSTALLED = '[{"name":"dnsmasq","version":"2.91-r2","description":"DNS","installed-size":296539},{"name":"busybox","version":"1.37.0-r6","description":"bb","installed-size":400000}]';

function ctx(outputs, spawned) {
	return {
		root: ROOT,
		run: (argv) => { let k = join(' ', argv); return outputs[k] ?? null; },
		spawn: (argv) => { push(spawned ?? [], argv); return 0; },
	};
}

test('list_installed sorts packages and lists upgradable names', () => {
	let c = ctx({
		'apk query --format json --installed --fields name,version,description,installed-size *': INSTALLED,
		'apk query --format json --installed --upgradable --fields name *': '[{"name":"dnsmasq"}]',
	});
	let r = list_installed(c);
	eq(map(r.packages, p => p.name), [ 'busybox', 'dnsmasq' ]);
	eq(r.packages[1], { name: 'dnsmasq', version: '2.91-r2', description: 'DNS', installed_size: 296539 });
	eq(r.upgradable, [ 'dnsmasq' ]);
});

test('list_available pages through the repository index', () => {
	let all = [];
	for (let i = 0; i < 250; i++) push(all, { name: `p${i}`, version: '1' });
	let c = ctx({ 'apk query --format json --available --fields name,version *': sprintf('%J', all) });
	let r = list_available(c, 200, 100);
	eq([ r.total, r.offset, length(r.packages), r.packages[0].name ], [ 250, 200, 50, 'p200' ]);
	eq(length(list_available(c, -1, 100000).packages), 100);
});

test('search validates the query and wraps it in a glob', () => {
	let c = ctx({ 'apk query --format json --available --match name,description --fields name,version,description *vpn*': '[{"name":"openvpn","version":"2.6","description":"VPN"}]' });
	eq(search(c, 'vpn'), { packages: [ { name: 'openvpn', version: '2.6', description: 'VPN' } ] });
	eq(search(c, 'v'), 2);
	eq(search(c, 'a b'), 2);
	eq(search(c, '*'), 2);
});

test('search ranks exact and name matches before description matches', () => {
	let c = ctx({ 'apk query --format json --available --match name,description --fields name,version,description *tree*': '[{"name":"augeas","version":"1","description":"a tree"},{"name":"tree","version":"2"},{"name":"treeview","version":"3"}]' });
	eq(map(search(c, 'tree').packages, p => p.name), [ 'tree', 'treeview', 'augeas' ]);
});

test('lists counts the cached repository indexes and reports the newest', () => {
	let dir = here() + '/fixtures/pkglists';
	let newest = max(stat(dir + '/var/cache/apk/APKINDEX.29e4f88d.tar.gz').mtime,
		stat(dir + '/var/cache/apk/APKINDEX.4af1e21d.tar.gz').mtime);
	eq(lists({ root: dir, now: () => 1700000000 }), { count: 2, updated: newest, now: 1700000000 });
	// After a reboot /var/cache/apk is empty or missing: no lists.
	eq(lists({ root: here() + '/fixtures/pkglists-none', now: () => 5 }), { count: 0, updated: null, now: 5 });
});

test('info prefers the installed package and flags it', () => {
	let f = '--fields name,version,description,url,license,installed-size,depends';
	let c = ctx({
		[`apk query --format json --installed ${f} dnsmasq`]: '[{"name":"dnsmasq","version":"2.91-r2","depends":["libc"]}]',
		[`apk query --format json --available ${f} tree`]: '[{"name":"tree","version":"2.2.1-r1"}]',
	});
	eq(info(c, 'dnsmasq'), { name: 'dnsmasq', version: '2.91-r2', depends: [ 'libc' ], installed: true });
	eq(info(c, 'tree').installed, false);
	eq(info(c, 'nope'), 4);
	eq(info(c, '-rf'), 2);
});

test('add/del/update start validated jobs', () => {
	let spawned = [];
	let c = ctx({}, spawned);
	ok(type(change(c, 'add', [ 'tree' ])) == 'object');
	change(c, 'add', [ 'tree', 'nano' ], true);
	change(c, 'del', [ 'tree' ]);
	update(c);
	eq(spawned, [
		[ '/usr/libexec/nuci/run-job', 'pkg', 'apk', 'add', 'tree' ],
		[ '/usr/libexec/nuci/run-job', 'pkg', 'apk', 'add', '-u', 'tree', 'nano' ],
		[ '/usr/libexec/nuci/run-job', 'pkg', 'apk', 'del', 'tree' ],
		[ '/usr/libexec/nuci/run-job', 'pkg', 'apk', 'update' ],
	]);
	eq(change(c, 'add', [ '--force-broken-world' ]), 2);
	eq(change(c, 'add', [ 'ok', 'bad name' ]), 2);
	eq(change(c, 'add', []), 2);
	eq(change(c, 'add', 'tree'), 2);
	eq(length(spawned), 4);
});

test('a busy job is reported as PERMISSION_DENIED', () => {
	let c = { root: ROOT, spawn: () => 16 };
	eq(start(c, 'pkg', [ 'apk', 'update' ]), 6);
});

test('job_status reads the state directory', () => {
	eq(job_status({ root: ROOT }), {
		name: 'pkg', running: false, command: 'apk add tree', started: 1791800000,
		log: '(1/1) Installing tree (2.2.1-r1)\nOK: 19 MiB in 187 packages\n', finished: 1791800005, rc: 0,
	});
	eq(status({ root: ROOT }, 'never'), { name: 'never', running: false });
});

test('backup status reports the archive; restore needs an upload', () => {
	let st = backup_status({ root: ROOT });
	eq([ st.rc, st.path, st.size ], [ 0, '/tmp/nuci-backup.tar.gz', 6 ]);
	eq(backup_restore({ root: ROOT, spawn: () => 0 }), 4);
	let spawned = [];
	backup_create({ root: ROOT, spawn: (a) => (push(spawned, a), 0) });
	eq(spawned[0], [ '/usr/libexec/nuci/run-job', 'backup', '/sbin/sysupgrade', '-b', '/tmp/nuci-backup.tar.gz' ]);
});

done();
