// SPDX-License-Identifier: Apache-2.0
// Phase 16: attended sysupgrade (nuci-app-asu, ADR-0007) against a local
// stand-in for the build service, with a real flash of the QEMU lab. Runs
// in the "upgrade" project, after every other spec (playwright.config.ts).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { createRpc } from '../../packages/rpc/src/index.ts';
import { startAsuStub } from '../lib/asu-stub';
import { rootPassword } from '../lib/router';
import { slow } from '../lib/timing';
import { login } from '../lib/ui';

const base = `http://127.0.0.1:${process.env.NUCI_HTTP_PORT ?? '8080'}`;
const SUFFIX = (process.env.NUCI_TARGET ?? 'x86/64') === 'x86/64' ? '' : '-armv8';
const IMAGE = join(import.meta.dirname, `../../tools/qemu/images/asu-25.12.0${SUFFIX}.img.gz`);
const PORT = Number(process.env.NUCI_ASU_STUB_PORT ?? 18600);
const MARKER = `nuci-upgraded-${Date.now() % 100000}`;

async function api() {
	const rpc = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await rpc.session.login('root', rootPassword());
	return rpc;
}

const gone = async (path: string) => {
	try {
		await (await api()).file.stat(path);
		return false;
	} catch {
		return true;
	}
};

test('attended sysupgrade: build, flash, and NuCI and the settings survive', async ({ page }) => {
	// One flash per run, in the last transport pass (e2e/run.sh).
	test.skip(process.env.NUCI_E2E_LAST === '0', 'the router is reflashed in the last pass only');
	test.skip(
		!existsSync(IMAGE),
		`no upgrade image ${IMAGE} (tools/imagebuilder/build.sh, NUCI_IB_ASU=1)`,
	);
	test.setTimeout(slow(1_200_000));

	const rpc = await api();
	// What owut sees: rpc-sys packagelist names libraries without their ABI suffix.
	const installed = (
		await rpc.client.call<{ packages: Record<string, string> }>('rpc-sys', 'packagelist', {
			all: true,
		})
	).packages;
	test.skip(!installed['nuci-app-asu'], 'nuci-app-asu is not installed on the lab');

	const stub = await startAsuStub({
		port: PORT,
		publicHost: '10.0.2.2', // the host, seen from the QEMU guest
		image: IMAGE,
		from: '25.12.0',
		to: '25.12.99',
		installed,
	});
	try {
		// A setting that has to survive, and the stub as the build service.
		await rpc.uci.set('system', '@system[0]', { hostname: MARKER });
		await rpc.uci.set('attendedsysupgrade', 'server', { url: stub.url });
		await rpc.uci.apply(false);
		// No result or image from an earlier run on this lab.
		await rpc.file.exec('/bin/rm', ['-rf', '/tmp/nuci-asu', '/tmp/nuci-jobs/asu']);

		await login(page, 'system/upgrade');
		await page.getByTestId('asu-check').click();
		await expect(page.getByTestId('asu-result')).toContainText('can be upgraded to 25.12.99', {
			timeout: slow(300_000),
		});
		if (await page.getByTestId('asu-accept').isVisible())
			await page.getByTestId('asu-accept').check();
		await page.getByTestId('asu-download').click();
		await expect(page.getByTestId('asu-install')).toBeVisible({ timeout: slow(300_000) });

		// NuCI's packages are not built by the service; their dependencies are.
		const request = stub.builds.at(-1) as { packages?: string[]; packages_versions?: object };
		const requested = request.packages ?? Object.keys(request.packages_versions ?? {});
		expect(requested).not.toContain('nuci');
		expect(requested).not.toContain('nuci-app-asu');
		expect(requested).toEqual(expect.arrayContaining(['uhttpd-mod-ucode', 'rpcd-mod-ucode']));

		await page.getByTestId('asu-install').click();
		await page.getByTestId('asu-confirm-go').click();
		await expect(page.getByTestId('asu-phase')).toBeVisible();
		// Flash, reboot, then the page reloads into the login form.
		await expect(page.getByLabel('Password')).toBeVisible({ timeout: slow(900_000) });
	} finally {
		await stub.close();
	}

	const after = await api();
	const system = Object.values(await after.uci.getAll('system')).find(
		(s) => s['.type'] === 'system',
	);
	expect(system?.hostname).toBe(MARKER);
	expect((await after.nuci.apps.list()).map((a) => a.id)).toContain('asu');
	// The keep entry existed only for the flash: ordinary backups never carry NuCI.
	expect(await gone('/lib/upgrade/keep.d/nuci-asu')).toBe(true);
	// No feed carries NuCI on the lab: the reinstall hook gives up and cleans up.
	await expect.poll(() => gone('/etc/nuci-asu/packages'), { timeout: slow(240_000) }).toBe(true);

	await login(page);
	await expect(page.getByTestId('sidebar')).toBeVisible();
});
