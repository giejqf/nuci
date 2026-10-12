// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOST_KEY, parseManifest, registerPage, type PageDefinition } from './index';

const page: PageDefinition = { path: 'services/hello', title: 'Hello', mount: () => {} };

describe('app-sdk', () => {
	afterEach(() => {
		delete (globalThis as Record<string, unknown>)[HOST_KEY];
	});

	it('parses and sanitizes manifests', () => {
		expect(
			parseManifest({
				id: 'hello',
				title: 'Hello',
				entry: 'apps/hello/index.js',
				menu: { order: 5 },
			}),
		).toEqual({
			id: 'hello',
			title: 'Hello',
			icon: null,
			entry: 'apps/hello/index.js',
			version: null,
			menu: { group: 'services', order: 5 },
			acls: [],
		});
		expect(parseManifest({ id: 'Hello', title: 'x', entry: 'a.js' })).toBeNull();
		expect(parseManifest({ id: 'x', title: 'x', entry: '../a.js' })).toBeNull();
		expect(parseManifest({ id: 'x', title: 'x', entry: 'a.css' })).toBeNull();
		expect(parseManifest(null)).toBeNull();
	});

	it('registers pages with the host', () => {
		const registerPageHost = vi.fn();
		(globalThis as Record<string, unknown>)[HOST_KEY] = {
			sdkVersion: '0.1.0',
			registerPage: registerPageHost,
		};
		registerPage('hello', page);
		expect(registerPageHost).toHaveBeenCalledWith('hello', page);
	});

	it('refuses to run outside the host and validates input', () => {
		expect(() => registerPage('hello', page)).toThrow(/not running inside/);
		(globalThis as Record<string, unknown>)[HOST_KEY] = {
			sdkVersion: '0.1.0',
			registerPage: () => {},
		};
		expect(() => registerPage('Hello', page)).toThrow(/invalid app id/);
		expect(() => registerPage('hello', { ...page, path: 'hello' })).toThrow(
			/invalid page path/,
		);
	});
});
