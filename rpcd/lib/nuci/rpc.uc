// SPDX-License-Identifier: Apache-2.0
//
// Adapter between pure NuCI method implementations and rpcd's ucode plugin
// API. An implementation receives the validated args object and returns
// either a reply object or a UBUS_STATUS_* integer (AGENTS.md §3.1).

'use strict';

// Mirrors libubus' enum ubus_msg_status, so libraries and host tests do not
// depend on the globals rpcd injects into plugin scripts.
const STATUS = {
	OK: 0,
	INVALID_COMMAND: 1,
	INVALID_ARGUMENT: 2,
	METHOD_NOT_FOUND: 3,
	NOT_FOUND: 4,
	NO_DATA: 5,
	PERMISSION_DENIED: 6,
	TIMEOUT: 7,
	NOT_SUPPORTED: 8,
	UNKNOWN_ERROR: 9,
	CONNECTION_FAILED: 10,
};

// Turn { name: { args, call: (args, req) => object|int } } into rpcd methods.
function methods(defs) {
	let out = {};

	for (let name, def in defs) {
		let impl = def.call;

		out[name] = {
			args: def.args ?? {},
			call: function(req) {
				let res = impl(req.args ?? {}, req);

				if (type(res) == 'int')
					return req.error(res);

				return res;
			}
		};
	}

	return out;
}

export { STATUS, methods };
