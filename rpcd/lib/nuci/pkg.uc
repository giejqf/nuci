// SPDX-License-Identifier: Apache-2.0
//
// apk (apk-tools 3) wrappers for nuci.pkg. Queries use `apk query --format
// json`; changes run as the detached job "pkg". Package names and search
// terms are validated before they become argv entries.

'use strict';

import { lsdir, stat } from 'fs';
import { context } from 'nuci.util';
import { start, status } from 'nuci.job';

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/;
const QUERY_RE = /^[A-Za-z0-9._+-]{2,64}$/;
const MAX_RESULTS = 200;
// apk keeps downloaded repository indexes here; /var is tmpfs on OpenWrt, so
// they are gone after every reboot until `apk update` runs again.
const INDEX_DIR = '/var/cache/apk';

function valid_name(n) {
	return type(n) == 'string' && match(n, NAME_RE) != null;
}

function query(ctx, args) {
	let out = ctx.run([ 'apk', 'query', '--format', 'json', ...args ]);

	try {
		return json(out ?? '[]') ?? [];
	}
	catch (e) {
		return [];
	}
}

function normalize(p) {
	let out = { name: p.name, version: p.version };

	if (p.description != null) out.description = p.description;
	if (p['installed-size'] != null) out.installed_size = p['installed-size'];
	if (p.license != null) out.license = p.license;
	if (p.url != null) out.url = p.url;
	if (p.depends != null) out.depends = p.depends;

	return out;
}

function list_installed(ctx) {
	ctx = context(ctx);

	let pkgs = map(query(ctx, [ '--installed', '--fields', 'name,version,description,installed-size', '*' ]), normalize);
	let up = map(query(ctx, [ '--installed', '--upgradable', '--fields', 'name', '*' ]), p => p.name);

	return { packages: sort(pkgs, (a, b) => (a.name < b.name) ? -1 : 1), upgradable: sort(up) };
}

function list_available(ctx, offset, limit) {
	ctx = context(ctx);

	let all = query(ctx, [ '--available', '--fields', 'name,version', '*' ]);
	offset = (type(offset) == 'int' && offset > 0) ? offset : 0;
	limit = (type(limit) == 'int' && limit > 0 && limit <= 500) ? limit : 100;

	return { total: length(all), offset, packages: map(slice(all, offset, offset + limit), normalize) };
}

// Returns { packages } or a ubus status code.
function search(ctx, q) {
	ctx = context(ctx);

	if (type(q) != 'string' || !match(q, QUERY_RE))
		return 2;

	let found = query(ctx, [ '--available', '--match', 'name,description', '--fields', 'name,version,description', `*${q}*` ]);
	let lq = lc(q);

	// Exact name, then name contains the term, then description-only matches.
	let rank = (p) => (lc(p.name) == lq) ? 0 : (index(lc(p.name), lq) >= 0) ? 1 : 2;
	found = sort(found, (a, b) => (rank(a) - rank(b)) || ((a.name < b.name) ? -1 : 1));

	return { packages: map(slice(found, 0, MAX_RESULTS), normalize) };
}

function info(ctx, name) {
	ctx = context(ctx);

	if (!valid_name(name))
		return 2;

	let fields = [ '--fields', 'name,version,description,url,license,installed-size,depends' ];
	let inst = query(ctx, [ '--installed', ...fields, name ]);
	let p = inst[0] ?? query(ctx, [ '--available', ...fields, name ])[0];

	if (!p)
		return 4; // NOT_FOUND

	p = normalize(p);
	p.installed = length(inst) > 0;

	return p;
}

// Downloaded package lists: how many indexes, the newest one's mtime (apk
// update rewrites them even when unchanged) and the router clock to compare.
function lists(ctx) {
	let now = ctx?.now; // context() keeps only the standard fields
	ctx = context(ctx);

	let count = 0, updated = null;

	for (let f in lsdir(ctx.root + INDEX_DIR) ?? []) {
		if (!match(f, /^APKINDEX\..+\.tar\.gz$/))
			continue;

		count++;

		let m = stat(`${ctx.root}${INDEX_DIR}/${f}`)?.mtime;

		if (m != null && (updated == null || m > updated))
			updated = m;
	}

	return { count, updated, now: now ? now() : time() };
}

function update(ctx) {
	return start(ctx, 'pkg', [ 'apk', 'update' ]);
}

function change(ctx, action, names, upgrade) {
	if (type(names) != 'array' || !length(names) || length(names) > 50)
		return 2;

	for (let n in names)
		if (!valid_name(n))
			return 2;

	let argv = (action == 'add') ? [ 'apk', 'add', ...(upgrade ? [ '-u' ] : []) ] : [ 'apk', 'del' ];

	return start(ctx, 'pkg', [ ...argv, ...names ]);
}

function job_status(ctx) {
	return status(ctx, 'pkg');
}

export { valid_name, list_installed, list_available, search, info, lists, update, change, job_status };
