// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { matchLocale } from './locale';

describe('matchLocale', () => {
	const available = ['en', 'de', 'zh-CN'];
	it('prefers exact tags, then the primary language', () => {
		expect(matchLocale(['de-AT', 'en'], available)).toBe('de');
		expect(matchLocale(['zh', 'en'], available)).toBe('zh-CN');
		expect(matchLocale(['zh-Hans-CN'], available)).toBe('zh-CN');
		expect(matchLocale(['ZH-cn'], available)).toBe('zh-CN');
		expect(matchLocale(['fr-FR', 'de'], available)).toBe('de');
		expect(matchLocale(['fr'], available)).toBe('en');
	});
});
