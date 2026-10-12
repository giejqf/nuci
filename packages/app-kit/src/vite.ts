// SPDX-License-Identifier: Apache-2.0
//
// Vite config for a nuci-app: one minified ES module (dist/index.js) with its
// CSS inlined, `@nuci/i18n` routed to the host (ADR-0004).

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
			// An app entry only registers pages (no exports), so it is built as an
			// application chunk: library mode keeps ES output's whitespace.
			rollupOptions: {
				input: `${root}/src/index.ts`,
				output: {
					format: 'es',
					entryFileNames: 'index.js',
					codeSplitting: false,
				},
				preserveEntrySignatures: false,
			},
			outDir: `${root}/dist`,
			emptyOutDir: true,
			target: 'es2022',
			sourcemap: false,
			cssCodeSplit: false,
			assetsInlineLimit: 0,
			minify: true,
		},
	};
}
