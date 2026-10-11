// SPDX-License-Identifier: Apache-2.0
//
// Bundle budget (AGENTS.md §3.3): shell + login + Status overview ≤ 250 KB gzip,
// every lazily loaded chunk ≤ 80 KB gzip. Reads Vite's build manifest.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'apps/web/dist');
const MANIFEST = join(DIST, '.vite/manifest.json');
const INITIAL_BUDGET = 250 * 1024;
const CHUNK_BUDGET = 80 * 1024;
// Lazy chunks that are part of the initial experience and count toward the 250 KB budget.
const INITIAL_LAZY = [/pages\/status\/Overview\.svelte$/, /shell\/Login\.svelte$/];

if (!existsSync(MANIFEST)) {
	console.error('No build manifest; run `pnpm build` first.');
	process.exit(1);
}

/** @type {Record<string, {file: string, css?: string[], imports?: string[], dynamicImports?: string[], isEntry?: boolean, isDynamicEntry?: boolean}>} */
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const gz = new Map();
const gzSize = (file) => {
	if (!gz.has(file)) gz.set(file, gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length);
	return gz.get(file);
};

/** Files (js + css) loaded by a manifest key, following static imports. */
function closure(key, seen = new Set()) {
	const chunk = manifest[key];
	if (!chunk || seen.has(key)) return new Set();
	seen.add(key);
	const files = new Set([chunk.file, ...(chunk.css ?? [])]);
	for (const imp of chunk.imports ?? []) for (const f of closure(imp, seen)) files.add(f);
	return files;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
let failed = false;

const entries = Object.keys(manifest).filter((k) => manifest[k].isEntry);
const initialKeys = [
	...entries,
	...Object.keys(manifest).filter((k) => INITIAL_LAZY.some((re) => re.test(k))),
];
const initialFiles = new Set();
for (const k of initialKeys) for (const f of closure(k)) initialFiles.add(f);
const initial = [...initialFiles].reduce((sum, f) => sum + gzSize(f), 0);
const ok = initial <= INITIAL_BUDGET;
failed ||= !ok;
console.log(
	`${ok ? 'ok  ' : 'FAIL'} initial (shell + login + overview): ${kb(initial)} / ${kb(INITIAL_BUDGET)}`,
);

for (const [key, chunk] of Object.entries(manifest)) {
	if (!chunk.isDynamicEntry) continue;
	const own = [chunk.file, ...(chunk.css ?? [])].reduce((sum, f) => sum + gzSize(f), 0);
	const ok = own <= CHUNK_BUDGET;
	failed ||= !ok;
	console.log(`${ok ? 'ok  ' : 'FAIL'} chunk ${key}: ${kb(own)} / ${kb(CHUNK_BUDGET)}`);
}

process.exit(failed ? 1 : 0);
