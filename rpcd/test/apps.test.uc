// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, ok, here, done } from 'harness';
import { list_apps, parse_manifest } from 'nuci.apps';
import { methods, STATUS } from 'nuci.rpc';

const FIX = here() + '/fixtures/apps';

test('list_apps returns valid manifests ordered by menu.order then id', () => {
	let apps = list_apps(FIX);
	eq(map(apps, a => a.id), [ 'hello', 'zeta' ]);
	eq(apps[0].menu, { group: 'services', order: 10 });
	eq(apps[1].menu, { group: 'services', order: 100 });
	eq(apps[1].icon, null);
});

test('parse_manifest rejects path traversal and bad ids', () => {
	eq(parse_manifest('{"id":"x","title":"X","entry":"../x.js"}'), null);
	eq(parse_manifest('{"id":"X Y","title":"X","entry":"x.js"}'), null);
	eq(parse_manifest('{"id":"x","title":"X","entry":"x.css"}'), null);
	eq(parse_manifest('nope'), null);
	ok(parse_manifest('{"id":"x","title":"X","entry":"a/b.js"}'));
});

test('list_apps on a missing directory is empty', () => {
	eq(list_apps(FIX + '/nope'), []);
});

test('methods() maps integer results to req.error', () => {
	let m = methods({ fail: { call: () => STATUS.INVALID_ARGUMENT }, okay: { call: (a) => ({ got: a.x }) } });
	let errored = null;
	let req = { args: { x: 1 }, error: (c) => { errored = c; } };
	m.fail.call(req);
	eq(errored, 2);
	eq(m.okay.call(req), { got: 1 });
	eq(m.okay.args, {});
});

done();
