// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { grantsFor, roleOf } from './roles';

const groups = Object.fromEntries(
	[
		'unauthenticated',
		'nuci-base',
		'nuci-uci',
		'nuci-status',
		'nuci-system',
		'nuci-network',
		'nuci-admin',
		'nuci-software',
		'nuci-backup',
		'nuci-firewall',
		'nuci-users',
		'nuci-app-ddns',
	].map((g) => [g, '']),
);

describe('roles', () => {
	it('keeps backups, users and the pre-login group out of non-admin roles', () => {
		const ro = grantsFor('readonly', groups);
		expect(ro.write).toEqual([]);
		expect(ro.read).toContain('nuci-app-ddns');
		for (const g of ['nuci-backup', 'nuci-users', 'nuci-admin', 'unauthenticated'])
			expect(ro.read).not.toContain(g);
		const op = grantsFor('operator', groups);
		expect(op.write).toEqual(['nuci-uci', 'nuci-network', 'nuci-firewall']);
		expect(op.read).toContain('nuci-admin');
		expect(op.read).not.toContain('nuci-backup');
	});

	it('recognises presets regardless of order, else custom', () => {
		expect(roleOf({ read: ['*'], write: ['*'] }, groups)).toBe('administrator');
		const op = grantsFor('operator', groups);
		expect(roleOf({ read: [...op.read].reverse(), write: op.write }, groups)).toBe('operator');
		expect(roleOf({ read: ['nuci-status'], write: [] }, groups)).toBe('custom');
	});
});
