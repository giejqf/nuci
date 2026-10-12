// SPDX-License-Identifier: Apache-2.0
//
// Vite config for a nuci-app: one ES module (dist/index.js) with its CSS
// inlined, `@nuci/i18n` routed to the host (ADR-0004).

import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import type { UserConfig } from 'vite';
import { lucideImports } from '../../ui/vite/lucide-imports.ts';

export interface NuciAppOptions {
	/** The app directory (contains src/index.ts). */
	root: string;
}

export function nuciApp({ root }: NuciAppOptions): UserConfig {
	return {
		root,
		plugins: [lucideImports(), tailwindcss(), svelte()],
		resolve: {
			alias: [
				{
					find: /^@nuci\/i18n$/,
					replacement: fileURLToPath(
						new URL('../../i18n/src/remote.ts', import.meta.url),
					),
				},
			],
		},
		build: {
			lib: {
				entry: `${root}/src/index.ts`,
				formats: ['es'],
				fileName: () => 'index.js',
			},
			outDir: `${root}/dist`,
			emptyOutDir: true,
			target: 'es2022',
			sourcemap: false,
			cssCodeSplit: false,
		},
	};
}
