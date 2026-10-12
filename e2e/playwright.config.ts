// SPDX-License-Identifier: Apache-2.0
import { defineConfig, devices } from '@playwright/test';
import { slow } from './lib/timing';

const port = process.env.NUCI_HTTP_PORT ?? '8080';

export default defineConfig({
	testDir: './tests',
	timeout: slow(60_000),
	expect: { timeout: slow(15_000) },
	// One router: tests share state, so run them serially.
	workers: 1,
	fullyParallel: false,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		trace: 'retain-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
