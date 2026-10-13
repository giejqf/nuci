// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-adblock: state of the adblock service (its runtime JSON), the
// feed catalogue, the local allow- and blocklists, and adblock's own actions
// (reload, suspend, resume, search) as detached jobs.

'use strict';

import { writefile, rename, glob } from 'fs';
import { context, read } from 'nuci.util';
import { start, status as job_status } from 'nuci.job';

const INIT = '/etc/init.d/adblock';
const RUNTIME = '/var/run/adblock/adblock.runtime.json';
const FEEDS = '/etc/adblock/adblock.feeds';
const CUSTOM_FEEDS = '/etc/adblock/adblock.custom.feeds';
const CATEGORIES = '/etc/adblock/adblock.categories';
const LISTS = {
	allow: '/etc/adblock/adblock.allowlist',
	block: '/etc/adblock/adblock.blocklist',
};
// Feeds whose content is chosen per category (uci list option, categories file prefix).
const CATEGORY_FEEDS = {
	'1hosts': [ 'adb_hst_feed', 'hst' ],
	hagezi: [ 'adb_hag_feed', 'hag' ],
	ipfire_dbl: [ 'adb_ipf_feed', 'ipf' ],
	stevenblack: [ 'adb_stb_feed', 'stb' ],
	utcapitole: [ 'adb_utc_feed', 'utc' ],
};
const ACTIONS = [ 'reload', 'restart', 'suspend', 'resume' ];
// A whole list goes in one /ubus request (64 KiB): bounded well below that.
const MAX_DOMAINS = 2000;
const LABEL = '[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?';
const DOMAIN_RE = regexp(`^(${LABEL}\\.)*${LABEL}$`);

function parse_json(text) {
	try {
		return text ? json(text) : null;
	}
	catch (e) {
		return null;
	}
}

function valid_domain(d) {
	return type(d) == 'string' && length(d) <= 253 && match(d, DOMAIN_RE) != null;
}

// "1 234 567" (adblock groups digits with spaces) -> 1234567
function count(s) {
	s = replace(`${s ?? ''}`, /[^0-9]/g, '');

	return length(s) ? +s : null;
}

// "mode: start, date / time: 2026-10-13 18:31:28, duration: 0m 17s, memory: ..."
function last_run(s) {
	if (type(s) != 'string')
		return null;

	let m = match(s, /mode: ([a-z]+), date \/ time: ([0-9-]+ [0-9:]+), duration: ([0-9]+)m ([0-9]+)s/);

	return m ? { mode: m[1], time: m[2], duration: +m[3] * 60 + +m[4] } : null;
}

function status(ctx) {
	ctx = context(ctx);

	let rt = parse_json(read(ctx, RUNTIME));
	let feeds = filter(rt?.active_feeds ?? [], f => f != '-');

	return {
		// enabled, disabled, paused, processing, error, stopped (null: never ran)
		state: rt?.adblock_status || null,
		blocked: count(rt?.blocked_domains),
		feeds,
		backend: rt?.dns_backend ? split(rt.dns_backend, ',')[0] : null,
		version: rt?.backend_ver || null,
		last_run: last_run(rt?.last_run),
		// adblock only starts at boot (and runs at all) when its init script is enabled.
		autostart: length(glob(`${ctx.root}/etc/rc.d/S*adblock`) ?? []) > 0,
		job: job_status(ctx, 'adblock'),
		search: job_status(ctx, 'adblock-search'),
	};
}

function host_of(url) {
	return match(url ?? '', /^[a-z]+:\/\/([^\/:]+)/)?.[1];
}

// The feed catalogue adblock uses (a non-empty custom file replaces the stock one).
function feeds(ctx) {
	ctx = context(ctx);

	let custom = parse_json(read(ctx, CUSTOM_FEEDS));
	let doc = (type(custom) == 'object' && length(custom)) ? custom : parse_json(read(ctx, FEEDS));
	let cats = {};

	for (let line in split(read(ctx, CATEGORIES) ?? '', '\n')) {
		let f = split(trim(line), ';');

		if (length(f) >= 2 && length(f[1]))
			push(cats[f[0]] ??= [], { value: f[2] ?? f[1], label: f[1] });
	}

	let out = [];

	for (let name, f in (type(doc) == 'object') ? doc : {}) {
		if (type(f) != 'object')
			continue;

		let e = { name, descr: f.descr ?? '', size: f.size ?? '', host: host_of(f.url) };
		let c = CATEGORY_FEEDS[name];

		if (c && cats[c[1]]) {
			e.option = c[0];
			e.categories = cats[c[1]];
		}

		push(out, e);
	}

	return { custom: type(custom) == 'object' && length(custom) > 0, feeds: sort(out, (a, b) => (a.name < b.name) ? -1 : 1) };
}

function domains(text) {
	let out = [];

	for (let l in split(text ?? '', '\n')) {
		l = trim(l);

		if (length(l) && substr(l, 0, 1) != '#')
			push(out, l);
	}

	return out;
}

function lists(ctx) {
	ctx = context(ctx);

	return { allow: domains(read(ctx, LISTS.allow)), block: domains(read(ctx, LISTS.block)) };
}

function run(ctx, action) {
	ctx = context(ctx);

	if (!(action in ACTIONS))
		return 2; // INVALID_ARGUMENT

	return start(ctx, 'adblock', [ INIT, action ]);
}

// Replace a local list, then reload adblock so it takes effect. Comments in
// the file are not kept. Returns { job } (null when a run was already busy).
function set_list(ctx, list, items) {
	ctx = context(ctx);

	let path = LISTS[list];

	if (!path || type(items) != 'array' || length(items) > MAX_DOMAINS)
		return 2;

	let seen = {}, out = [];

	for (let d in items) {
		if (!valid_domain(d))
			return 2;

		if (!seen[d]) {
			seen[d] = true;
			push(out, d);
		}
	}

	let tmp = `${ctx.root}${path}.nuci`;

	if (writefile(tmp, length(out) ? join('\n', out) + '\n' : '') == null || !rename(tmp, ctx.root + path))
		return 9; // UNKNOWN_ERROR

	let job = start(ctx, 'adblock', [ INIT, 'reload' ]);

	return { job: (type(job) == 'object') ? job : null };
}

// Look a domain up in the active blocklist and the local lists (output in the job log).
function search(ctx, domain) {
	ctx = context(ctx);

	if (!valid_domain(domain))
		return 2;

	return start(ctx, 'adblock-search', [ INIT, 'search', domain ]);
}

export { valid_domain, status, feeds, lists, run, set_list, search };
