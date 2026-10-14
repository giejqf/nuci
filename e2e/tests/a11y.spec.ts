// SPDX-License-Identifier: Apache-2.0
// Phase 6 accessibility pass: axe-core on every v1 route, light and dark.
// Serious and critical WCAG 2.1 A/AA violations fail the test.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { login } from '../lib/ui';
import { slow } from '../lib/timing';

const ROUTES = [
	'status/overview',
	'status/syslog',
	'status/kernlog',
	'status/processes',
	'status/realtime',
	'system/general',
	'system/admin',
	'system/software',
	'system/startup',
	'system/backup',
	'system/reboot',
	'network/interfaces',
	'network/interfaces/lan',
	'network/devices',
	'network/wireless',
	'network/dhcp',
	'network/hostnames',
	'network/routes',
	'network/diagnostics',
	'firewall/general',
	'firewall/zones',
	'firewall/forwards',
	'firewall/rules',
	'firewall/nat',
	'system/users',
	'network/wireguard',
	'network/sqm',
	'services/ddns',
	'services/upnp',
	'services/adblock',
	'status/traffic',
	'services/https-dns-proxy',
	'services/wol',
	'services/frpc',
	'services/minidlna',
	'system/uhttpd',
];

for (const scheme of ['light', 'dark'] as const) {
	test.describe(scheme, () => {
		test.use({ colorScheme: scheme });

		test(`no serious accessibility violations (${scheme})`, async ({ page }) => {
			test.setTimeout(slow(600_000));
			await login(page);
			const problems: string[] = [];
			for (const route of ROUTES) {
				await page.goto(`/nuci/#/${route}`);
				await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
				await page.waitForLoadState('networkidle').catch(() => {});
				const result = await new AxeBuilder({ page })
					.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
					.analyze();
				for (const v of result.violations)
					if (v.impact === 'serious' || v.impact === 'critical')
						problems.push(
							`${route}: ${v.id} (${v.impact}) ${v.nodes
								.map((n) => n.target.join(' '))
								.slice(0, 3)
								.join(' | ')}`,
						);
			}
			expect(problems, problems.join('\n')).toEqual([]);
		});
	});
}

test('login page has no serious accessibility violations', async ({ page }) => {
	await page.goto('/nuci/');
	await expect(page.getByTestId('login-form')).toBeVisible();
	const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
	expect(
		result.violations
			.filter((v) => v.impact === 'serious' || v.impact === 'critical')
			.map((v) => v.id),
	).toEqual([]);
});
