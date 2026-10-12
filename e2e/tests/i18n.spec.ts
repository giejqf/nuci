// SPDX-License-Identifier: Apache-2.0
// Phase 11: the UI in each shipped language without missing translations.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { rootPassword } from '../lib/router';

const REPO = join(import.meta.dirname, '../..');
const json = (p: string) =>
	JSON.parse(readFileSync(join(REPO, p), 'utf8')) as Record<string, string>;
const KEYS = new Set(Object.keys(json('packages/i18n/en.json')));
for (const d of readdirSync(join(REPO, 'apps')).filter((d) => d.startsWith('nuci-app-')))
	for (const k of Object.keys(json(`apps/${d}/src/en.json`))) KEYS.add(k);

const ROUTES = [
	'status/overview',
	'status/realtime',
	'system/general',
	'system/users',
	'network/interfaces',
	'network/devices',
	'firewall/zones',
	'firewall/forwards',
	'network/wireguard',
	'network/sqm',
	'services/ddns',
	'services/upnp',
];

/** Visible texts and accessible names that are raw catalog keys (= missing translations). */
async function rawKeys(page: Page): Promise<string[]> {
	const found = await page.evaluate(() => {
		const out: string[] = [];
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			const s = n.textContent?.trim();
			if (s) out.push(s);
		}
		for (const el of document.querySelectorAll('[aria-label],[title],[placeholder]'))
			for (const a of ['aria-label', 'title', 'placeholder']) {
				const v = el.getAttribute(a);
				if (v) out.push(v.trim());
			}
		return out;
	});
	return [...new Set(found.filter((s) => KEYS.has(s)))];
}

for (const [locale, expected] of [
	['de', { lang: 'de', nav: 'Schnittstellen' }],
	['zh-CN', { lang: 'zh-CN', nav: '接口' }],
] as const) {
	test(`${locale}: shell and one page per group are fully translated`, async ({ page }) => {
		test.setTimeout(300_000);
		// Only the first load: the switch back to English below must stick.
		await page.addInitScript((l) => {
			if (!localStorage.getItem('nuci.locale')) localStorage.setItem('nuci.locale', l);
		}, locale);
		await page.goto('/nuci/#/status/overview');
		await expect(page.locator('html')).toHaveAttribute('lang', expected.lang);
		expect(await rawKeys(page), 'login page').toEqual([]);
		await page.locator('#login-pass').fill(rootPassword());
		await page.locator('form[data-testid="login-form"] button[type="submit"]').click();
		await expect(page.getByTestId('sidebar')).toBeVisible();
		await expect(page.getByTestId('sidebar')).toContainText(expected.nav);
		const problems: string[] = [];
		for (const route of ROUTES) {
			await page.goto(`/nuci/#/${route}`);
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			await page.waitForLoadState('networkidle').catch(() => {});
			for (const k of await rawKeys(page)) problems.push(`${route}: ${k}`);
		}
		expect(problems, problems.join('\n')).toEqual([]);
		// Switching back to English through the topbar.
		await page.getByTestId('language').selectOption('en');
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await expect(page.getByTestId('sidebar')).toContainText('Interfaces');
	});
}
