// SPDX-License-Identifier: Apache-2.0
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		lib: {
			entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
			formats: ['es'],
			fileName: () => 'index.js',
		},
		outDir: fileURLToPath(new URL('./dist', import.meta.url)),
		emptyOutDir: true,
		target: 'es2022',
	},
});
