// SPDX-License-Identifier: Apache-2.0
//
// i18n catalog extraction (AGENTS.md D12, Phase 6).
//
//   node tools/i18n-extract.mjs              report unused English keys
//   node tools/i18n-extract.mjs --template de
//       write packages/i18n/locales/de.json: every English key, keeping
//       existing translations, new ones empty ("" falls back to English)
//
// Keys built at runtime (t(`wireless.enc.${x}`)) are recognised by their
// literal prefix, so they are not reported as unused.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EN = join(ROOT, 'packages/i18n/en.json');
const LOCALES = join(ROOT, 'packages/i18n/locales');
const DIRS = ['apps/web/src', 'packages/ui/src', 'packages/rpc/src'];

const catalog = JSON.parse(readFileSync(EN, 'utf8'));

function* files(dir) {
	for (const e of readdirSync(dir)) {
		const p = join(dir, e);
		if (statSync(p).isDirectory()) yield* files(p);
		else if (/\.(ts|svelte)$/.test(p) && !/\.test\.ts$/.test(p)) yield p;
	}
}

const used = new Set();
const prefixes = new Set();
for (const dir of DIRS) {
	for (const f of files(join(ROOT, dir))) {
		const src = readFileSync(f, 'utf8');
		for (const m of src.matchAll(/['"`]([a-z][a-z0-9_]*(?:\.[a-z0-9_-]+)+)['"`]/gi))
			used.add(m[1]);
		for (const m of src.matchAll(/`([a-z][a-z0-9_]*(?:\.[a-z0-9_-]+)*[._-])\$\{/gi))
			prefixes.add(m[1]);
	}
}

const isUsed = (k) => used.has(k) || [...prefixes].some((p) => k.startsWith(p));
const arg = process.argv.indexOf('--template');

if (arg > 0) {
	const locale = process.argv[arg + 1];
	if (!locale || !/^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
		console.error('usage: --template <locale>, e.g. de or pt-BR');
		process.exit(2);
	}
	mkdirSync(LOCALES, { recursive: true });
	const out = join(LOCALES, `${locale}.json`);
	const existing = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
	const merged = Object.fromEntries(
		Object.keys(catalog)
			.sort()
			.map((k) => [k, existing[k] ?? '']),
	);
	writeFileSync(out, JSON.stringify(merged, null, '\t') + '\n');
	const done = Object.values(merged).filter(Boolean).length;
	console.log(`wrote ${out}: ${done}/${Object.keys(merged).length} translated`);
} else {
	const unused = Object.keys(catalog)
		.filter((k) => !isUsed(k))
		.sort();
	console.log(`${Object.keys(catalog).length} keys, ${unused.length} unused`);
	for (const k of unused) console.log(`  unused: ${k}`);
	process.exit(unused.length ? 1 : 0);
}
