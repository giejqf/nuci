// SPDX-License-Identifier: Apache-2.0
//
// Bundle budget (AGENTS.md §3.3, ADR-0003): shell + login + Status overview
// ≤ 120 KB gzip, every lazily loaded chunk ≤ 20 KB gzip. Reads Vite's manifest.
// First-party nuci-apps (apps/nuci-app-*/dist/index.js, own Svelte runtime
// included) ≤ 60 KB gzip each (ADR-0004).

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'apps/web/dist');
const MANIFEST = join(DIST, '.vite/manifest.json');
const INITIAL_BUDGET = 120 * 1024;
const CHUNK_BUDGET = 20 * 1024;
const APP_BUDGET = 60 * 1024;
// Lazy chunks that are part of the initial experience and count toward the initial budget.
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

for (const dir of readdirSync(join(ROOT, 'apps')).filter((d) => d.startsWith('nuci-app-'))) {
	const entry = join(ROOT, 'apps', dir, 'dist/index.js');
	if (!existsSync(entry)) {
		failed = true;
		console.log(`FAIL app ${dir}: not built (pnpm build)`);
		continue;
	}
	const size = gzipSync(readFileSync(entry), { level: 9 }).length;
	const ok = size <= APP_BUDGET;
	failed ||= !ok;
	console.log(`${ok ? 'ok  ' : 'FAIL'} app ${dir}: ${kb(size)} / ${kb(APP_BUDGET)}`);
}

process.exit(failed ? 1 : 0);
