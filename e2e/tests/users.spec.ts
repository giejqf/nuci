// SPDX-License-Identifier: Apache-2.0
// Phase 9: non-root users (ADR-0006). A read-only user sees only permitted
// pages without write controls, and the router refuses its writes.

import { expect, test, type Page } from '@playwright/test';
import { createRpc, isRpcError, transfer } from '../../packages/rpc/src/index.ts';
import { rootPassword } from '../lib/router';
import { login, loginAs } from '../lib/ui';
import { slow } from '../lib/timing';

const base = `http://127.0.0.1:${process.env.NUCI_HTTP_PORT ?? '8080'}`;
const USER = 'e2eview';
const PW = 'Viewer-pw-1';
const PW2 = 'Viewer-pw-2';

async function rpcAs(user: string, pw: string) {
	const rpc = createRpc({ endpoint: `${base}/ubus`, storage: null });
	await rpc.session.login(user, pw);
	return rpc;
}

async function denied(p: Promise<unknown>) {
	const e = await p.then(
		() => null,
		(err: unknown) => err,
	);
	expect(
		isRpcError(e) && e.isPermissionDenied,
		`expected permission denied, got ${String(e)}`,
	).toBe(true);
}

/** Buttons whose label means "change something". */
const WRITE_BUTTON =
	/^(add|delete|save|save & apply|apply|install|remove|update lists|run|restart|stop|start|enable|disable|upload|flash|reboot|scan|join|hup|term|kill|create|regenerate.*|restore.*|generate.*)$/i;

// Column sort buttons in table headings are not write controls (e.g. "Upload").
async function enabledWriteControls(page: Page): Promise<string[]> {
	const found: string[] = [];
	for (const b of await page.locator('main button:visible:not(th button)').all()) {
		const name = ((await b.getAttribute('aria-label')) ?? (await b.innerText())).trim();
		if (WRITE_BUTTON.test(name) && (await b.isEnabled())) found.push(`button "${name}"`);
		if (/^(delete|edit) /i.test(name) && (await b.isEnabled())) found.push(`button "${name}"`);
	}
	// uci-bound fields lock themselves (readonly/disabled) without write access.
	for (const f of await page.locator('main [data-uci]:visible').all())
		if (await f.isEditable()) found.push(`field ${await f.getAttribute('data-uci')}`);
	return found;
}

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
	const root = await rpcAs('root', rootPassword());
	await root.nuci.users.delete(USER).catch(() => {});
});

test('root adds a read-only user from System → Users', async ({ page }) => {
	await login(page, 'system/users');
	await expect(page.getByTestId('users')).toContainText('root');
	await expect(page.getByTestId('users').getByRole('row', { name: /root/ })).toContainText(
		'built-in administrator',
	);
	await page.getByTestId('users-add').click();
	await page.getByTestId('user-name').fill('Bad Name');
	await expect(page.getByText('Use lowercase letters')).toBeVisible();
	await page.getByTestId('user-name').fill(USER);
	await page.getByTestId('user-password').fill(PW);
	await page.getByTestId('user-password2').fill(PW);
	await page.getByTestId('user-role').selectOption('readonly');
	await page.getByTestId('user-save').click();
	await expect(
		page.getByTestId('users').getByRole('row', { name: new RegExp(USER) }),
	).toContainText('Read-only');
});

test('the read-only user sees permitted pages without write controls', async ({ page }) => {
	test.setTimeout(slow(300_000));
	await loginAs(page, USER, PW);
	const sidebar = page.getByTestId('sidebar');
	for (const hidden of ['Users', 'Backup / Flash', 'Administration'])
		await expect(sidebar.getByRole('link', { name: hidden, exact: true })).toHaveCount(0);
	const links = await sidebar
		.getByRole('link')
		.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''));
	expect(links).toContain('#/network/interfaces');
	const problems: string[] = [];
	for (const href of links.filter((h) => h.startsWith('#/'))) {
		await page.goto(`/nuci/${href}`);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await page.waitForLoadState('networkidle').catch(() => {});
		for (const c of await enabledWriteControls(page)) problems.push(`${href}: ${c}`);
	}
	expect(problems, problems.join('\n')).toEqual([]);
	await expect(page.getByTestId('apply-apply')).toHaveCount(0);
});

test('the router refuses writes from the read-only user', async () => {
	const rpc = await rpcAs(USER, PW);
	await denied(rpc.uci.set('system', '@system[0]', { hostname: 'pwned' }));
	await denied(rpc.nuci.pkg.add(['tcpdump']));
	await denied(rpc.nuci.users.list());
	await denied(rpc.system.reboot());
	await denied(transfer.download(rpc.client, 'backup'));
	// Reading is allowed.
	expect((await rpc.system.board()).hostname).toBeTruthy();
});

test('root changes the role and password, then deletes the user', async ({ page }) => {
	await login(page, 'system/users');
	const row = page.getByTestId('users').getByRole('row', { name: new RegExp(USER) });
	await row.getByRole('button', { name: `Permissions of ${USER}` }).click();
	await page.getByTestId('user-role').selectOption('operator');
	await page.getByTestId('user-save').click();
	await expect(row).toContainText('Operator');
	// Operators may stage uci changes for network (and nothing for system).
	const op = await rpcAs(USER, PW);
	await op.uci.set('network', 'lan', { ip6assign: '60' });
	await op.uci.revert('network');
	await denied(op.uci.set('system', '@system[0]', { hostname: 'pwned' }));

	await row.getByRole('button', { name: `Password of ${USER}` }).click();
	await page.getByTestId('user-newpw').fill(PW2);
	await page.getByTestId('user-newpw2').fill(PW2);
	await page.getByTestId('user-newpw-save').click();
	await expect(page.getByText(`Password of ${USER} changed.`)).toBeVisible();
	await expect(rpcAs(USER, PW)).rejects.toThrow();
	await rpcAs(USER, PW2);

	await row.getByRole('button', { name: `Delete ${USER}` }).click();
	await page.getByTestId('user-delete-confirm').click();
	await expect(
		page.getByTestId('users').getByRole('row', { name: new RegExp(USER) }),
	).toHaveCount(0);
	await expect(rpcAs(USER, PW2)).rejects.toThrow();
});
