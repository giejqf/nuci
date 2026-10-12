// SPDX-License-Identifier: Apache-2.0
//
// Test doubles for the uci cursor and ubus connection that collectors use.

'use strict';

// data: { config: { section_name: { '.type': ..., option: value } } }
function uci_stub(data) {
	return {
		get: (config, section, option) => data[config]?.[section]?.[option],
		foreach: (config, type, fn) => {
			for (let name, s in data[config] ?? {})
				if (s['.type'] == type)
					fn({ ...s, '.name': name });
		},
	};
}

// replies: { 'object.method': value }
function ubus_stub(replies) {
	let calls = [];

	return {
		calls,
		call: (object, method, args) => {
			push(calls, [ object, method, args ]);
			return replies[`${object}.${method}`];
		},
	};
}

// Serve command output from fixture files: argv[0] basename -> cmd/<name>.
function run_stub(root, outputs) {
	return (argv) => outputs?.[join(' ', argv)] ?? null;
}

export { uci_stub, ubus_stub, run_stub };
