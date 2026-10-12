// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { matchPath, parseHash } from './router.svelte';

describe('hash router', () => {
	it('parses hashes', () => {
		expect(parseHash('#/status/overview')).toBe('status/overview');
		expect(parseHash('#status/overview/')).toBe('status/overview');
		expect(parseHash('#/network/interfaces?x=1')).toBe('network/interfaces');
		expect(parseHash('')).toBe('');
	});

	it('matches patterns with params', () => {
		expect(matchPath('status/overview', 'status/overview')).toEqual({});
		expect(matchPath('network/interfaces/:name', 'network/interfaces/lan')).toEqual({
			name: 'lan',
		});
		expect(matchPath('network/interfaces/:name', 'network/interfaces')).toBeNull();
		expect(matchPath('status/overview', 'status/logs')).toBeNull();
	});
});
