// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, here, done } from 'harness';
import { summarize, status, run } from 'nuci.app.asu';

const fixtures = here() + '/../../apps/nuci-app-asu/rpcd/test/fixtures';
const HELPER = '/usr/libexec/nuci/asu';
const RUNNER = '/usr/libexec/nuci/run-job';

function ctx(root, spawned) {
	return { root, spawn: (argv) => { push(spawned ?? [], argv); return 0; } };
}

test('status summarizes the last owut check (recorded on 25.12.0 armsr)', () => {
	let s = status(ctx(fixtures + '/root'));
	eq(s.check.from, { version: '25.12.0', revision: 'r32713-f919e7899d', kernel: '6.12.71' });
	eq(s.check.to, { version: '25.12.5', revision: 'r33051-f5dae5ece4', kernel: '6.12.94' });
	eq(s.check.device, { target: 'armsr/armv8', profile: 'generic', board: 'qemu-kvm-virtual-machine' });
	eq(map(s.check.changes, c => c.name), [ 'base-files', 'dropbear' ]);
	eq(s.check.changes[0], { name: 'base-files', from: '1693~f919e7899d', to: '1711~f5dae5ece4' });
	eq(s.check.missing, [ 'example-gone' ]);
	eq(s.check.errors, []);
	eq(s.check.warnings, [ 'There are 1 missing default packages, confirm this is expected before proceeding' ]);
	eq(s.check.ok, true);
	eq(s.check.branches['25.12'].latest, '25.12.5');
	eq(s.image, { version: '25.12.5', size: 5 });
	eq(s.job, { name: 'asu', running: false });
});

test('downgrades block the upgrade: owut only warns in check, download refuses them', () => {
	let s = summarize({ build: {}, packageDB: {} },
		"WARNING: There are 1 missing default packages, confirm this is expected before proceeding\n" +
		"WARNING: Checks reveal package downgrades, upgrade still possible with '--force' (re-run with '--verbose' for details)\n", 0);
	eq(length(s.errors), 1);
	eq(length(s.warnings), 1);
	eq(s.ok, false);
});

test('without a check or an image there is nothing to summarize', () => {
	let s = status(ctx(fixtures + '/empty'));
	eq([ s.check, s.image ], [ null, null ]);
});

test('check validates the version and passes it to the helper as one argument', () => {
	let spawned = [];
	let c = ctx(fixtures + '/empty', spawned);
	eq(run(c, 'check', '25.12.5; reboot'), 2);
	eq(run(c, 'check', '-V'), 2);
	run(c, 'check');
	run(c, 'check', '25.12.5');
	eq(spawned, [ [ RUNNER, 'asu', HELPER, 'check' ], [ RUNNER, 'asu', HELPER, 'check', '25.12.5' ] ]);
});

test('download only builds the version the last clean check was for', () => {
	let spawned = [];
	eq(run(ctx(fixtures + '/empty', spawned), 'download', '25.12.5'), 2); // no check yet
	let c = ctx(fixtures + '/root', spawned);
	eq(run(c, 'download', '25.12.4'), 2);
	eq(run(c, 'download', null), 2);
	run(c, 'download', '25.12.5');
	eq(spawned, [ [ RUNNER, 'asu', HELPER, 'download', '25.12.5' ] ]);
});

test('install needs a downloaded image; unknown steps are refused', () => {
	let spawned = [];
	eq(run(ctx(fixtures + '/empty', spawned), 'install'), 2);
	run(ctx(fixtures + '/root', spawned), 'install');
	eq(run(ctx(fixtures + '/root', spawned), 'reboot'), 2);
	eq(spawned, [ [ RUNNER, 'asu', HELPER, 'install' ] ]);
});

done();
