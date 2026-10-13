// SPDX-License-Identifier: Apache-2.0
'use strict';

import { readfile, writefile, mkdir } from 'fs';
import { test, eq, here, done } from 'harness';
import { valid_domain, status, feeds, lists, run, set_list, search } from 'nuci.app.adblock';

const fixtures = here() + '/../../apps/nuci-app-adblock/rpcd/test/fixtures';
const RUNNER = '/usr/libexec/nuci/run-job';

function ctx(root, spawned) {
	return { root: root ?? fixtures + '/root', spawn: (argv) => { push(spawned ?? [], argv); return 0; } };
}

test('status: runtime JSON of adblock 4.5.8 (recorded on 25.12.0)', () => {
	let s = status(ctx());

	eq(s.state, 'enabled');
	eq(s.blocked, 329899);
	eq(s.feeds, [ 'adguard', 'adguard_tracking', 'certpl' ]);
	eq(s.backend, 'dnsmasq (2.93-r1)');
	eq(s.version, '4.5.8-r3');
	eq(s.last_run, { mode: 'start', time: '2026-10-13 18:31:28', duration: 77 });
	eq(s.autostart, true);
	eq(s.job, { name: 'adblock', running: false });
});

test('status before adblock ever ran', () => {
	let s = status(ctx('/nonexistent'));

	eq([ s.state, s.blocked, s.feeds, s.last_run, s.autostart ], [ null, null, [], null, false ]);
});

test('feeds: catalogue with categories for the category feeds', () => {
	let f = feeds(ctx());

	eq(f.custom, false);
	eq(map(f.feeds, e => e.name), [ 'adguard', 'certpl', 'hagezi', 'utcapitole' ]);
	eq(f.feeds[0], { name: 'adguard', descr: 'general', size: 'L', host: 'adguardteam.github.io' });
	eq(f.feeds[2].option, 'adb_hag_feed');
	eq(f.feeds[2].categories, [
		{ value: 'wildcard/light-onlydomains.txt', label: 'multi-light' },
		{ value: 'wildcard/multi-onlydomains.txt', label: 'multi-normal' },
	]);
	eq(f.feeds[3].categories, [ { value: 'adult', label: 'adult' }, { value: 'ai', label: 'ai' } ]);
});

test('lists: domains without comments and blank lines', () => {
	eq(lists(ctx()), { allow: [ 'ads.nuci-e2e.test', 'example.org' ], block: [] });
});

test('domains are validated', () => {
	for (let d in [ 'example.com', 'ads.nuci-e2e.test', 'localhost', 'a_b.example', 'xn--bcher-kva.example' ])
		eq(valid_domain(d), true, d);

	for (let d in [ '', 'Example.com', '-a.example', 'a-.example', 'a..b', '.a', 'a.', 'a b', 'a;reboot', '$(id)', 'a/b' ])
		eq(valid_domain(d), false, d);

	let label = sprintf('%063d', 0);
	eq(valid_domain(join('.', [ label, label, label ])), true);
	eq(valid_domain(join('.', [ label, label, label, label ])), false); // 255 > 253
	eq(valid_domain(label + '0.example'), false); // label > 63
	eq(valid_domain(123), false);
});

test('set_list writes the file and reloads adblock; bad input changes nothing', () => {
	let root = '/tmp/nuci-adblock-test';
	let spawned = [];

	mkdir(root);
	mkdir(root + '/etc');
	mkdir(root + '/etc/adblock');
	writefile(root + '/etc/adblock/adblock.blocklist', 'old.example\n');

	eq(set_list(ctx(root, spawned), 'block', [ 'ads.nuci-e2e.test', 'b.example', 'ads.nuci-e2e.test' ]).job != null, true);
	eq(readfile(root + '/etc/adblock/adblock.blocklist'), 'ads.nuci-e2e.test\nb.example\n');
	eq(spawned, [ [ RUNNER, 'adblock', '/etc/init.d/adblock', 'reload' ] ]);

	eq(set_list(ctx(root), 'block', [ 'ok.example', 'bad;rm -rf /' ]), 2);
	eq(set_list(ctx(root), 'shadow', [ 'ok.example' ]), 2);
	eq(set_list(ctx(root), 'block', 'ok.example'), 2);
	eq(readfile(root + '/etc/adblock/adblock.blocklist'), 'ads.nuci-e2e.test\nb.example\n');

	eq(set_list(ctx(root), 'block', []).job != null, true);
	eq(readfile(root + '/etc/adblock/adblock.blocklist'), '');
	system([ 'rm', '-rf', root ]);
});

test('run and search start jobs with fixed argv', () => {
	let spawned = [];

	eq(type(run(ctx(null, spawned), 'suspend')), 'object');
	eq(run(ctx(null, spawned), 'stop; reboot'), 2);
	eq(type(search(ctx(null, spawned), 'ads.nuci-e2e.test')), 'object');
	eq(search(ctx(null, spawned), '-x'), 2);
	eq(spawned, [
		[ RUNNER, 'adblock', '/etc/init.d/adblock', 'suspend' ],
		[ RUNNER, 'adblock-search', '/etc/init.d/adblock', 'search', 'ads.nuci-e2e.test' ],
	]);
});

done();
