// SPDX-License-Identifier: Apache-2.0
//
// Installed nuci-app manifests (/usr/share/nuci/apps/<id>.json).

'use strict';

import { glob, readfile } from 'fs';

const APPS_DIR = '/usr/share/nuci/apps';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ENTRY_RE = /^[A-Za-z0-9._\/-]+\.js$/;

// Returns a sanitized manifest, or null when the file is not a valid manifest.
function parse_manifest(text) {
	let m;

	try {
		m = json(text);
	}
	catch (e) {
		return null;
	}

	if (type(m) != 'object' || !match(m.id, ID_RE) || type(m.title) != 'string' ||
	    !match(m.entry, ENTRY_RE) || index(m.entry, '..') >= 0)
		return null;

	let menu = (type(m.menu) == 'object') ? m.menu : {};

	return {
		id: m.id,
		title: m.title,
		icon: (type(m.icon) == 'string') ? m.icon : null,
		entry: m.entry,
		version: (type(m.version) == 'string') ? m.version : null,
		menu: {
			group: (type(menu.group) == 'string') ? menu.group : 'services',
			order: (type(menu.order) == 'int') ? menu.order : 100,
		},
		acls: filter((type(m.acls) == 'array') ? m.acls : [], a => type(a) == 'string'),
	};
}

function list_apps(dir) {
	let apps = [];

	for (let path in sort(glob(`${dir ?? APPS_DIR}/*.json`) ?? [])) {
		let m = parse_manifest(readfile(path));

		if (m)
			push(apps, m);
	}

	return sort(apps, (a, b) => (a.menu.order - b.menu.order) || ((a.id < b.id) ? -1 : 1));
}

export { APPS_DIR, parse_manifest, list_apps };
