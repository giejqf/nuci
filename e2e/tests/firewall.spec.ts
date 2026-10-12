// SPDX-License-Identifier: Apache-2.0
// Phase 5: the Firewall group. Exit criterion: a port forward added in the
// UI is visible in the live nftables ruleset (`nft list ruleset`).

import { expect, test, type Page } from '@playwright/test';
import { createRpc } from '../../packages/rpc/src/index.ts';
import { rootPassword } from '../lib/router';
import { login } from '../lib/ui';
import { slow } from '../lib/timing';

const base = `http://127.0.0.1:${process.env.NUCI_HTTP_PORT ?? '8080'}`;

async function api() {
	const rpc = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await rpc.session.login('root', rootPassword());
	return rpc;
}

async function applyWithRollback(page: Page) {
	await page.getByTestId('apply-apply').click();
	await expect(page.getByTestId('apply-status')).toContainText('roll back in', {
		timeout: slow(30_000),
	});
	await expect(page.getByText('Configuration applied.')).toBeVisible({ timeout: slow(120_000) });
}

const liveRuleset = async () => (await (await api()).nuci.firewall.ruleset()).text;

/** The live `forward` base chain: fw4 implements REJECT as a final `jump handle_reject`. */
const forwardChain = async () =>
	/chain forward \{[\s\S]*?\n\t\}/.exec(await liveRuleset())?.[0] ?? '';

test.describe.configure({ mode: 'serial' });

test('general: forward policy change applies; preview shows the generated ruleset', async ({
	page,
}) => {
	test.setTimeout(slow(240_000));
	await login(page, 'firewall/general');
	await expect(page.getByTestId('fw-forward')).toHaveValue('REJECT');
	await page.getByTestId('fw-forward').selectOption('DROP');
	await applyWithRollback(page);
	await expect.poll(forwardChain, { timeout: slow(30_000) }).not.toContain('jump handle_reject');

	await page.getByTestId('fw-preview').click();
	await expect(page.getByTestId('fw-preview-text')).toContainText('table inet fw4');
	await page.getByTestId('fw-preview-modal').getByRole('button', { name: 'Close' }).click();

	await page.getByTestId('fw-forward').selectOption('REJECT');
	await applyWithRollback(page);
	await expect.poll(forwardChain, { timeout: slow(30_000) }).toContain('jump handle_reject');
});

test('port forward, traffic rule and NAT rule land in the live nftables ruleset', async ({
	page,
}) => {
	test.setTimeout(slow(300_000));
	await login(page, 'firewall/forwards');
	await page.getByTestId('forwards-add').click();
	await page.getByTestId('fwd-name').fill('e2e-fwd');
	await page.getByTestId('fwd-src-dport').fill('8022');
	await page.getByTestId('fwd-dest-ip').fill('192.168.1.50');
	await page.getByTestId('fwd-dest-port').fill('22');
	await page.getByTestId('forwards-done').click();

	await page.goto('/nuci/#/firewall/rules');
	await page.getByTestId('rules-add').click();
	await page.getByTestId('rule-name').fill('e2e-block');
	await page.getByTestId('rule-dest-port').fill('9999');
	await page.getByTestId('rule-target').selectOption('DROP');
	await page.getByTestId('rules-done').click();

	await page.goto('/nuci/#/firewall/nat');
	await page.getByTestId('nat-add').click();
	await page.getByTestId('nat-name').fill('e2e-snat');
	await page.getByTestId('nat-src-ip').fill('192.168.1.0/24');
	await page.getByTestId('nat-target').selectOption('SNAT');
	await page.getByTestId('nat-snat-ip').fill('10.0.2.15');
	await page.getByTestId('nat-done').click();

	await expect(page.getByTestId('apply-review')).toContainText('3 unsaved');
	await applyWithRollback(page);

	await expect.poll(liveRuleset, { timeout: slow(30_000) }).toContain('e2e-fwd');
	const rules = await liveRuleset();
	expect(rules).toMatch(/dnat ip to 192\.168\.1\.50:22 comment "!fw4: e2e-fwd"/);
	expect(rules).toMatch(/dport 9999 .*drop comment "!fw4: e2e-block"/);
	expect(rules).toMatch(/snat ip to 10\.0\.2\.15 comment "!fw4: e2e-snat"/);

	// Remove all three through the UI and apply once.
	await page.getByTestId('nat').getByRole('button', { name: 'Delete e2e-snat' }).click();
	await page.goto('/nuci/#/firewall/rules');
	await page.getByTestId('rules').getByRole('button', { name: 'Delete e2e-block' }).click();
	await page.goto('/nuci/#/firewall/forwards');
	await page.getByTestId('forwards').getByRole('button', { name: 'Delete e2e-fwd' }).click();
	await applyWithRollback(page);
	await expect.poll(liveRuleset, { timeout: slow(30_000) }).not.toContain('e2e-');
});

test('zones: a new zone with a forwarding gets its chains', async ({ page }) => {
	test.setTimeout(slow(300_000));
	await login(page, 'firewall/zones');
	await expect(page.getByTestId('zones').getByRole('row', { name: /^lan\b/ })).toContainText(
		'wan',
	);
	await page.getByTestId('zones-add').click();
	await page.getByTestId('zone-name').fill('e2ezone');
	await page.getByTestId('zone-forwards').getByLabel('wan').check();
	await page.getByTestId('zones-done').click();
	await expect(page.getByTestId('zones').getByRole('row', { name: /e2ezone/ })).toContainText(
		'wan',
	);
	await applyWithRollback(page);

	const rpc = await api();
	const fw = Object.values(await rpc.uci.getAll('firewall'));
	expect(
		fw.some((s) => s['.type'] === 'forwarding' && s.src === 'e2ezone' && s.dest === 'wan'),
	).toBe(true);
	await expect.poll(async () => (await rpc.nuci.firewall.preview()).text).toContain('e2ezone');

	await page.getByTestId('zones').getByRole('button', { name: 'Delete e2ezone' }).click();
	// Deleting a zone leaves its forwarding behind; remove it as well.
	const fwd = Object.entries(await rpc.uci.getAll('firewall')).find(
		([, s]) => s['.type'] === 'forwarding' && s.src === 'e2ezone',
	);
	if (fwd) {
		await rpc.uci.delete('firewall', fwd[0]);
	}
	await applyWithRollback(page);
	await rpc.uci.apply(false).catch(() => {});
	await expect
		.poll(async () => (await (await api()).nuci.firewall.preview()).text, {
			timeout: slow(60_000),
		})
		.not.toContain('e2ezone');
});
