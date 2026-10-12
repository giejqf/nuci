// SPDX-License-Identifier: Apache-2.0
//
// Role presets for NuCI users (ADR-0006): sets of rpcd ACL groups, computed
// from the groups installed on the router so app groups are included.
// Backups (configs incl. secrets, password hashes) and user management stay
// with administrators.

export type Role = 'administrator' | 'operator' | 'readonly' | 'custom';
export const ROLES: Role[] = ['administrator', 'operator', 'readonly', 'custom'];

/** Never offered for assignment: the pre-login group. */
const HIDDEN = ['unauthenticated'];
/** Not readable for operators and read-only users. */
const PRIVILEGED = ['nuci-users', 'nuci-backup'];
/** Additionally hidden from read-only users (SSH keys, web server certs). */
const ADMIN_ONLY = ['nuci-admin'];
/** What operators may change: network and firewall through the apply protocol. */
const OPERATOR_WRITE = ['nuci-uci', 'nuci-network', 'nuci-firewall'];

export interface Grants {
	read: string[];
	write: string[];
}

export function assignable(groups: Record<string, string>): string[] {
	return Object.keys(groups)
		.filter((g) => !HIDDEN.includes(g))
		.sort();
}

export function grantsFor(role: Exclude<Role, 'custom'>, groups: Record<string, string>): Grants {
	const all = assignable(groups);
	switch (role) {
		case 'administrator':
			return { read: ['*'], write: ['*'] };
		case 'operator':
			return {
				read: all.filter((g) => !PRIVILEGED.includes(g)),
				write: OPERATOR_WRITE.filter((g) => all.includes(g)),
			};
		case 'readonly':
			return {
				read: all.filter((g) => !PRIVILEGED.includes(g) && !ADMIN_ONLY.includes(g)),
				write: [],
			};
	}
}

const same = (a: string[], b: string[]) =>
	a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/** The preset a user's grants match, else custom. */
export function roleOf(user: Grants, groups: Record<string, string>): Role {
	for (const r of ['administrator', 'operator', 'readonly'] as const) {
		const g = grantsFor(r, groups);
		if (same(g.read, user.read) && same(g.write, user.write)) return r;
	}
	return 'custom';
}
