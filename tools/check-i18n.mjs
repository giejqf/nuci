// SPDX-License-Identifier: Apache-2.0
//
// Every literal i18n key used in the sources must exist in the English
// catalog (AGENTS.md §5: no hard-coded strings, keys from day one).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(ROOT, 'packages/i18n/en.json'), 'utf8'));
const DIRS = ['apps/web/src', 'packages/ui/src'];
// t('key') / t("key"), and registry-style label: 'some.key' strings
const CALL = /\bt\(\s*['"]([a-z0-9_.-]+)['"]/g;
const LABEL = /\b(?:label|description|title):\s*'([a-z][a-z0-9_]*\.[a-z0-9_.-]+)'/g;

function* files(dir) {
	for (const e of readdirSync(dir)) {
		const p = join(dir, e);
		if (statSync(p).isDirectory()) yield* files(p);
		else if (/\.(ts|svelte)$/.test(p) && !/\.test\.ts$/.test(p)) yield p;
	}
}

const missing = new Map();
for (const dir of DIRS) {
	for (const file of files(join(ROOT, dir))) {
		const src = readFileSync(file, 'utf8');
		for (const re of [CALL, LABEL]) {
			for (const m of src.matchAll(re)) {
				const key = m[1];
				if (!(key in catalog)) missing.set(key, file.slice(ROOT.length + 1));
			}
		}
	}
}

if (missing.size) {
	console.error(`Missing i18n keys (${missing.size}):`);
	for (const [k, f] of [...missing].sort()) console.error(`  ${k}  (${f})`);
	process.exit(1);
}
console.log('i18n keys ok');
