// SPDX-License-Identifier: Apache-2.0
// Phase 3: System pages. Exit criteria: package install/remove and firmware
// validation through the UI (sysupgrade itself is tested manually only).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createRpc } from '../../packages/rpc/src/index.ts';
import { rootPassword } from '../lib/router';
import { login } from '../lib/ui';

const base = `http://127.0.0.1:${process.env.NUCI_HTTP_PORT ?? '8080'}`;
const SUFFIX = (process.env.NUCI_TARGET ?? 'x86/64') === 'x86/64' ? '' : '-armv8';
const SYSUPGRADE = join(
	import.meta.dirname,
	`../../tools/qemu/images/sysupgrade-25.12.0${SUFFIX}.img.gz`,
);

async function api() {
	const rpc = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await rpc.session.login('root', rootPassword());
	return rpc;
}

async function saveAndApply(page: Page) {
	await page.getByTestId('apply-apply').click();
	await expect(page.getByText('Configuration applied.')).toBeVisible({ timeout: 90_000 });
}

test.describe.configure({ mode: 'serial' });

test('general: hostname and time zone apply through the ApplyBar', async ({ page }) => {
	test.setTimeout(180_000);
	await login(page, 'system/general');
	const host = page.getByTestId('hostname').locator('input').or(page.getByLabel('Hostname'));
	const original = await page.getByLabel('Hostname').inputValue();

	await page.getByLabel('Hostname').fill('bad host!');
	await expect(page.getByText('Enter a valid hostname.')).toBeVisible();
	await expect(page.getByTestId('apply-apply')).toBeDisabled();

	await page.getByLabel('Hostname').fill('nuci-sys-e2e');
	await page.getByLabel('Time zone').selectOption('Europe/Berlin');
	await expect(page.getByTestId('apply-review')).toContainText('3 unsaved');
	await saveAndApply(page);

	const rpc = await api();
	const sys = Object.values(await rpc.uci.getAll('system')).find((s) => s['.type'] === 'system')!;
	expect([sys.hostname, sys.zonename, sys.timezone]).toEqual([
		'nuci-sys-e2e',
		'Europe/Berlin',
		'CET-1CEST,M3.5.0,M10.5.0/3',
	]);
	await expect
		.poll(async () => (await rpc.system.board()).hostname, { timeout: 30_000 })
		.toBe('nuci-sys-e2e');

	// restore
	await page.getByLabel('Hostname').fill(original || 'OpenWrt');
	await page.getByLabel('Time zone').selectOption('UTC');
	await saveAndApply(page);
	void host;
});

async function removeIfInstalled(name: string) {
	const rpc = await api();
	const { packages } = await rpc.nuci.pkg.listInstalled();
	if (!packages.some((p) => p.name === name)) return;
	await rpc.nuci.pkg.del([name]);
	await expect
		.poll(async () => (await rpc.nuci.pkg.jobStatus()).running, { timeout: 120_000 })
		.toBe(false);
}

test('software: install and remove a package through the UI', async ({ page }) => {
	test.setTimeout(300_000);
	await removeIfInstalled('tree'); // a previous failed run may have left it installed
	await login(page, 'system/software');
	await expect(
		page.getByTestId('pkg-installed').getByRole('row', { name: /dnsmasq/ }),
	).toBeVisible();

	await page.getByTestId('pkg-update').click();
	await expect(page.getByText('Package lists updated.')).toBeVisible({ timeout: 120_000 });

	await page.getByRole('tab', { name: 'Available' }).click();
	await page.getByTestId('pkg-search').fill('tree');
	await page.getByRole('button', { name: 'Search' }).click();
	const row = page.getByTestId('pkg-results').getByRole('row', { name: /^tree\b/ });
	await row.getByRole('button', { name: 'Install tree' }).click();
	await page.getByTestId('pkg-confirm-go').click();
	await expect(page.getByText('Installed tree.')).toBeVisible({ timeout: 120_000 });
	await expect(page.getByTestId('pkg-job-log')).toContainText('tree');

	await page.getByRole('tab', { name: /Installed/ }).click();
	const installed = page.getByTestId('pkg-installed');
	await installed.getByRole('searchbox', { name: 'Filter', exact: true }).fill('tree');
	await installed.getByRole('button', { name: 'Remove tree' }).click();
	await page.getByTestId('pkg-confirm-go').click();
	await expect(page.getByText('Removed tree.')).toBeVisible({ timeout: 120_000 });
	await expect(installed.getByRole('row', { name: /^tree\b/ })).toHaveCount(0);
});

test('startup: init scripts are listed and a service restarts', async ({ page }) => {
	await login(page, 'system/startup');
	const table = page.getByTestId('init-scripts');
	await expect(table.getByRole('row', { name: /dropbear/ })).toContainText('enabled');
	await page.getByTestId('init-cron-restart').click();
	await expect(page.getByText('cron: Restart done.')).toBeVisible();

	const marker = `# nuci-e2e ${Date.now()}`;
	const rcLocal = page.getByTestId('rc-local');
	const original = await rcLocal.inputValue();
	await rcLocal.fill(`${marker}\n${original}`);
	await page.getByTestId('rc-local-save').click();
	await expect(page.getByText('rc.local saved.')).toBeVisible();
	const rpc = await api();
	expect(await rpc.file.read('/etc/rc.local')).toContain(marker);
	await rpc.file.write('/etc/rc.local', original.endsWith('\n') ? original : `${original}\n`, {
		mode: 0o755,
	});
});

test('administration: SSH keys and password round-trip', async ({ page }) => {
	await login(page, 'system/admin');
	const key =
		'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl nuci-e2e';
	const keys = page.getByTestId('ssh-keys');
	const original = await keys.inputValue();
	await keys.fill('not a key');
	await expect(page.getByText('1 line(s) are not valid public keys.')).toBeVisible();
	await expect(page.getByTestId('save-keys')).toBeDisabled();
	await keys.fill(`${original.trim()}\n${key}`.trim());
	await page.getByTestId('save-keys').click();
	await expect(page.getByText(/key\(s\) saved\./)).toBeVisible();
	const rpc = await api();
	expect(await rpc.file.read('/etc/dropbear/authorized_keys')).toContain('nuci-e2e');
	await rpc.file.write('/etc/dropbear/authorized_keys', original, { mode: 0o600 });

	// Setting the same password exercises rpc-sys password_set without breaking other tests.
	await page.getByLabel('New password').fill(rootPassword());
	await page.getByLabel('Confirm password').fill('different');
	await expect(page.getByText('The passwords do not match.')).toBeVisible();
	await page.getByLabel('Confirm password').fill(rootPassword());
	await page.getByRole('button', { name: 'Set password' }).click();
	await expect(page.getByText('The password was changed.')).toBeVisible();
});

test('backup: generate and download a configuration archive', async ({ page }) => {
	test.setTimeout(120_000);
	await login(page, 'system/backup');
	const download = page.waitForEvent('download', { timeout: 90_000 });
	await page.getByTestId('backup-create').click();
	const file = await download;
	expect(file.suggestedFilename()).toMatch(/^backup-.+-\d{4}-\d{2}-\d{2}\.tar\.gz$/);
	const path = await file.path();
	const { statSync } = await import('node:fs');
	expect(statSync(path).size).toBeGreaterThan(1000);
});

test('flash: a bogus image is rejected, the real image validates', async ({ page }) => {
	test.setTimeout(300_000);
	await login(page, 'system/backup');
	const input = page.getByTestId('firmware-file');

	await input.setInputFiles({
		name: 'bogus.bin',
		mimeType: 'application/octet-stream',
		buffer: Buffer.alloc(4096, 0x41),
	});
	await page.getByTestId('firmware-upload').click();
	await expect(page.getByTestId('firmware-validation')).toContainText(
		'The image failed verification.',
		{ timeout: 60_000 },
	);
	// Invalid images can only be flashed with the explicit, dangerous "force" opt-in.
	const flash = page.getByTestId('firmware-flash');
	if (await flash.count()) await expect(flash).toBeDisabled();

	test.skip(!existsSync(SYSUPGRADE), 'sysupgrade image not fetched (tools/qemu/fetch.sh)');
	await input.setInputFiles(SYSUPGRADE);
	await page.getByTestId('firmware-upload').click();
	await expect(page.getByTestId('firmware-validation')).toContainText(
		'The image is valid for this device.',
		{ timeout: 240_000 },
	);
	await expect(page.getByTestId('firmware-flash')).toBeEnabled();
	// Flashing itself is a manual test (AGENTS.md §9 Phase 3). Clean up the upload.
	const rpc = await api();
	await rpc.file.remove('/tmp/firmware.bin');
});
