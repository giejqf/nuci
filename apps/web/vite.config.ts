// SPDX-License-Identifier: Apache-2.0
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { lucideImports } from '../../packages/ui/vite/lucide-imports.ts';

const router = process.env.NUCI_ROUTER ?? 'http://127.0.0.1:8080';

export default defineConfig({
	// Relative base: the build is served from /www/nuci/ at /nuci/ (D7).
	base: './',
	plugins: [lucideImports(), tailwindcss(), svelte()],
	build: {
		target: 'es2022',
		manifest: true,
		sourcemap: false,
		assetsInlineLimit: 0,
	},
	server: {
		port: 5173,
		proxy: {
			'/ubus': { target: router, changeOrigin: true },
			'/nuci/events': { target: router, changeOrigin: true },
			'/nuci/transfer': { target: router, changeOrigin: true },
			'/nuci/probe': { target: router, changeOrigin: true },
		},
	},
});
