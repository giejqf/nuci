// SPDX-License-Identifier: Apache-2.0
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineProject } from 'vitest/config';

export default defineProject({
	// svelteTesting() selects Svelte's browser build so runes/effects run.
	plugins: [svelte(), svelteTesting()],
	test: {
		name: '@nuci/uci',
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
	},
});
