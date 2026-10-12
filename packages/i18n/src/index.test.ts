// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it } from 'vitest';
import { addCatalog, setLocale, t } from './index';

describe('t()', () => {
	afterEach(() => setLocale('en'));

	it('returns the English message', () => {
		expect(t('app.name')).toBe('NuCI');
	});

	it('returns the key for missing messages', () => {
		expect(t('does.not.exist')).toBe('does.not.exist');
	});

	it('interpolates parameters and leaves unknown placeholders', () => {
		addCatalog('en', { 'test.greet': 'Hello {name}, {missing}' });
		expect(t('test.greet', { name: 'router' })).toBe('Hello router, {missing}');
	});

	it('falls back to English per key', () => {
		addCatalog('de', { 'login.submit': 'Anmelden' });
		setLocale('de');
		expect(t('login.submit')).toBe('Anmelden');
		expect(t('app.name')).toBe('NuCI');
	});
});
