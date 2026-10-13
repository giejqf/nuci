// SPDX-License-Identifier: Apache-2.0
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineProject } from 'vitest/config';
import { lucideImports } from '../ui/vite/lucide-imports.ts';

export default defineProject({
	plugins: [lucideImports(), svelte()],
	test: {
		name: '@nuci/app-kit',
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
	},
});
