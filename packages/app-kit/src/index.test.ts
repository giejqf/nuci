// SPDX-License-Identifier: Apache-2.0
import { HOST_KEY, type PageDefinition } from '@nuci/app-sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { registerSveltePage } from './index';

describe('registerSveltePage', () => {
	afterEach(() => delete (globalThis as Record<string, unknown>)[HOST_KEY]);

	it('takes translated titles from the app catalogs by titleKey', () => {
		const pages: PageDefinition[] = [];
		(globalThis as Record<string, unknown>)[HOST_KEY] = {
			sdkVersion: '0.4.0',
			registerPage: (_id: string, p: PageDefinition) => pages.push(p),
		};
		registerSveltePage({
			id: 'demo',
			path: 'services/demo',
			title: 'Demo',
			titleKey: 'demo.nav',
			titles: { fr: 'Démo' },
			// Never mounted here.
			component: (() => {}) as never,
			messages: {
				en: { 'demo.nav': 'Demo' },
				de: { 'demo.nav': 'Vorführung' },
				'zh-CN': {},
			},
		});
		expect(pages[0]!.title).toBe('Demo');
		expect(pages[0]!.titles).toEqual({ fr: 'Démo', de: 'Vorführung' });
	});
});
