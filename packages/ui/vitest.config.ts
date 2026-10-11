// SPDX-License-Identifier: Apache-2.0
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineProject } from 'vitest/config';
import { lucideImports } from './vite/lucide-imports.ts';

export default defineProject({
	plugins: [lucideImports(), svelte(), svelteTesting()],
	test: {
		name: '@nuci/ui',
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
	},
});
