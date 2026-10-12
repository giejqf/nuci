// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { addCatalog, bindHost, getLocale, t } from './remote';

describe('@nuci/i18n/remote', () => {
	it('returns keys until bound, then translates through the host', () => {
		expect(t('ui.edit')).toBe('ui.edit');
		const added: [string, Record<string, string>][] = [];
		bindHost({
			t: (key, params) => `${key}:${params?.n ?? ''}`,
			addMessages: (locale, messages) => added.push([locale, messages]),
			locale: 'de',
		});
		expect(t('x.y', { n: 2 })).toBe('x.y:2');
		addCatalog('en', { 'app.k': 'v' });
		expect(added).toEqual([['en', { 'app.k': 'v' }]]);
		expect(getLocale()).toBe('de');
	});
});
