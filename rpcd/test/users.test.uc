// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, ok, done } from 'harness';
import { mkdtemp, mkdir, writefile, readfile } from 'fs';
import { list, groups, create, update, set_password, remove } from 'nuci.users';

function fixture() {
	let root = mkdtemp('/tmp/nuci-users-XXXXXX');
	for (let d in [ '/etc', '/usr', '/usr/share', '/usr/share/rpcd', '/usr/share/rpcd/acl.d' ])
		mkdir(root + d);
	writefile(root + '/etc/passwd', 'root:x:0:0:root:/root:/bin/ash\ndaemon:*:1:1:daemon:/var:/bin/false\nnobody:*:65534:65534:nobody:/var:/bin/false\n');
	writefile(root + '/etc/shadow', 'root:$5$abc:20000:0:99999:7:::\ndaemon:*:0:0:99999:7:::\nnobody:*:0:0:99999:7:::\n');
	writefile(root + '/usr/share/rpcd/acl.d/nuci-base.json', '{ "nuci-status": { "description": "Status" }, "nuci-network": {} }');
	return root;
}

// Writable uci double for the rpcd config.
function uci_double() {
	let data = { rpcd: { cfg01: { '.type': 'login', username: 'root', password: '$p$root', read: [ '*' ], write: [ '*' ] } } };
	let n = 0, commits = 0;
	return {
		data, commits: () => commits,
		foreach: (cfg, t, fn) => { for (let k, s in data[cfg]) if (s['.type'] == t) fn({ ...s, '.name': k }); },
		add: (cfg, t) => { let k = `new${++n}`; data[cfg][k] = { '.type': t }; return k; },
		set: (cfg, s, o, v) => { data[cfg][s][o] = v; },
		delete: (cfg, s, o) => { if (o) delete data[cfg][s][o]; else delete data[cfg][s]; },
		commit: () => commits++,
	};
}

function setup() {
	let pws = {};
	let ctx = { root: fixture(), uci: uci_double(), set_password: (u, p) => (pws[u] = p, true) };
	return { ctx, pws };
}

test('the default context resolves (no injected helpers)', () => {
	let root = fixture();
	eq(length(keys(groups({ root }))), 2);
	eq(list({ root, uci: uci_double() }).users[0].username, 'root');
});

test('groups come from the installed ACL files', () => {
	let ctx = setup().ctx;
	eq(groups(ctx), { 'nuci-network': '', 'nuci-status': 'Status' });
});

test('create: system account without a shell, password via passwd, login section', () => {
	let st = setup(), ctx = st.ctx, pws = st.pws;
	eq(create(ctx, { username: 'viewer', password: 'S3cret-pw', read: [ 'nuci-status' ], write: [] }), { username: 'viewer' });
	ok(index(readfile(ctx.root + '/etc/passwd'), 'viewer:x:1000:65534:NuCI user:/var:/bin/false\n') >= 0, 'passwd line');
	ok(match(readfile(ctx.root + '/etc/shadow'), /\nviewer:\*:[0-9]+:0:99999:7:::\n/), 'shadow line');
	eq(pws, { viewer: 'S3cret-pw' });
	let u = filter(list(ctx).users, (x) => x.username == 'viewer')[0];
	eq(u, { username: 'viewer', read: [ 'nuci-status' ], write: [], builtin: false, managed: true });
	eq(ctx.uci.data.rpcd.new1.password, '$p$viewer');
	ok(index(readfile(ctx.root + '/etc/passwd'), 'S3cret') < 0, 'no clear password anywhere');
});

test('create refuses root, existing accounts, bad names, weak passwords and unknown groups', () => {
	let ctx = setup().ctx;
	eq(create(ctx, { username: 'root', password: 'S3cret-pw' }), 2);
	eq(create(ctx, { username: 'daemon', password: 'S3cret-pw' }), 8);
	eq(create(ctx, { username: 'Bad Name', password: 'S3cret-pw' }), 2);
	eq(create(ctx, { username: 'x;rm', password: 'S3cret-pw' }), 2);
	eq(create(ctx, { username: 'ok', password: 'short' }), 2);
	eq(create(ctx, { username: 'ok', password: 'line\nbreak-pw' }), 2);
	eq(create(ctx, { username: 'ok', password: 'S3cret-pw', read: [ 'nuci-unknown' ] }), 2);
	eq(create(ctx, { username: 'ok', password: 'S3cret-pw', write: [ '*' ] }), { username: 'ok' });
});

test('update, set_password and delete never touch root', () => {
	let st = setup(), ctx = st.ctx, pws = st.pws;
	create(ctx, { username: 'op', password: 'S3cret-pw', read: [ '*' ] });
	eq(update(ctx, { username: 'op', read: [ 'nuci-status' ], write: [ 'nuci-network' ] }), { username: 'op' });
	eq(ctx.uci.data.rpcd.new1.write, [ 'nuci-network' ]);
	eq(set_password(ctx, { username: 'op', password: 'An0ther-pw' }), { username: 'op' });
	eq(pws.op, 'An0ther-pw');
	eq(update(ctx, { username: 'root', read: [] }), 6);
	eq(set_password(ctx, { username: 'root', password: 'An0ther-pw' }), 6);
	eq(remove(ctx, { username: 'root' }), 6);
	eq(remove(ctx, { username: 'op' }), { username: 'op' });
	ok(index(readfile(ctx.root + '/etc/passwd'), 'op:') < 0, 'account removed');
	ok(index(readfile(ctx.root + '/etc/shadow'), '\nop:') < 0, 'shadow removed');
	eq(map(list(ctx).users, (u) => u.username), [ 'root' ]);
	eq(remove(ctx, { username: 'op' }), 4);
});

test('a failing passwd leaves no half-created user', () => {
	let ctx = setup().ctx;
	ctx.set_password = () => false;
	eq(create(ctx, { username: 'half', password: 'S3cret-pw' }), 9);
	ok(index(readfile(ctx.root + '/etc/passwd'), 'half:') < 0, 'account rolled back');
	eq(length(list(ctx).users), 1);
});

done();
