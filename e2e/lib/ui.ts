// SPDX-License-Identifier: Apache-2.0
import { expect, type Page } from '@playwright/test';
import { rootPassword } from './router';

/** Log in through the NuCI login form and wait for the shell. */
export async function login(page: Page, path = 'status/overview'): Promise<void> {
	await page.goto(`/nuci/#/${path}`);
	await page.getByLabel('Password').fill(rootPassword());
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByTestId('sidebar')).toBeVisible();
}

/** Log in as another user (rpcd login) and wait for the shell. */
export async function loginAs(
	page: Page,
	username: string,
	password: string,
	path = 'status/overview',
): Promise<void> {
	await page.goto(`/nuci/#/${path}`);
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByTestId('sidebar')).toBeVisible();
}
