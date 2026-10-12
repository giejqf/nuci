// SPDX-License-Identifier: Apache-2.0
//
// Client-side view of the session ACLs (`session.access` without filters).
// rpcd matches object and function names with fnmatch(); `*` globs are honored.

import type { AclMap } from './types';

function glob(pattern: string, value: string): boolean {
	if (pattern === '*' || pattern === value) return true;
	if (!pattern.includes('*')) return false;
	const re = new RegExp(
		'^' +
			pattern
				.split('*')
				.map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
				.join('.*') +
			'$',
	);
	return re.test(value);
}

export class Acl {
	readonly map: AclMap;

	constructor(map: AclMap = {}) {
		this.map = map;
	}

	/** Whether the session may use `fn` on `object` in `scope`. */
	allows(scope: string, object: string, fn: string): boolean {
		const entries = this.map[scope];
		if (!entries) return false;
		for (const [obj, fns] of Object.entries(entries)) {
			if (glob(obj, object) && fns.some((f) => glob(f, fn))) return true;
		}
		return false;
	}

	/** May call the ubus method `object.method`. */
	canCall(object: string, method: string): boolean {
		return this.allows('ubus', object, method);
	}

	/** May read or write the uci config. */
	canUci(config: string, perm: 'read' | 'write' = 'read'): boolean {
		return this.allows('uci', config, perm);
	}

	/** May read or write a file through rpcd's `file` object (path ACLs). */
	canFile(path: string, perm: 'read' | 'write' = 'read'): boolean {
		return this.allows('file', path, perm) && this.canCall('file', perm);
	}

	/** Holds the ACL group (e.g. `nuci-status`) with `perm`. */
	hasGroup(group: string, perm: 'read' | 'write' = 'read'): boolean {
		return this.allows('access-group', group, perm);
	}
}
