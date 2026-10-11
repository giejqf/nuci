// SPDX-License-Identifier: Apache-2.0
//
// Rewrites `import { Wifi } from '@lucide/svelte'` into per-icon imports.
// Source keeps the documented barrel import (AGENTS.md §5); the dev server and
// Vitest then load one module per icon instead of ~4k.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*(['"])@lucide\/svelte\2\s*;?/g;
const EXPORT_RE = /export\s*\{\s*default\s+as\s+(\w+)\s*\}\s*from\s*['"]([^'"]+)['"]/g;

function loadIconMap(root: string): Map<string, string> {
	const require = createRequire(join(root, 'package.json'));
	const dist = dirname(require.resolve('@lucide/svelte'));
	const map = new Map<string, string>();
	for (const [index, base] of [
		['icons/index.js', 'icons'],
		['aliases/index.js', 'aliases'],
		['aliases/aliases.js', 'aliases'],
		['aliases/prefixed.js', 'aliases'],
		['aliases/suffixed.js', 'aliases'],
	] as const) {
		let src: string;
		try {
			src = readFileSync(join(dist, index), 'utf8');
		} catch {
			continue;
		}
		for (const m of src.matchAll(EXPORT_RE)) {
			const [, name, rel] = m;
			if (name && rel && !map.has(name)) map.set(name, join(dist, base, rel));
		}
	}
	return map;
}

export function lucideImports(): Plugin {
	let icons: Map<string, string> | undefined;
	let root = process.cwd();
	return {
		name: 'nuci:lucide-imports',
		enforce: 'pre',
		configResolved(config) {
			root = config.root;
		},
		transform(code, id) {
			if (id.includes('/node_modules/') || !code.includes('@lucide/svelte')) return null;
			icons ??= loadIconMap(root);
			const map = icons;
			let changed = false;
			const out = code.replace(IMPORT_RE, (whole, specifiers: string) => {
				const deep: string[] = [];
				const rest: string[] = [];
				for (const raw of specifiers.split(',')) {
					const spec = raw.trim();
					if (!spec) continue;
					const [imported = '', local = imported] = spec
						.split(/\s+as\s+/)
						.map((s) => s.trim());
					const file = map.get(imported);
					if (file) deep.push(`import ${local} from ${JSON.stringify(file)};`);
					else rest.push(spec);
				}
				if (!deep.length) return whole;
				changed = true;
				if (rest.length) deep.push(`import { ${rest.join(', ')} } from '@lucide/svelte';`);
				return deep.join(' ');
			});
			return changed ? { code: out, map: null } : null;
		},
	};
}
