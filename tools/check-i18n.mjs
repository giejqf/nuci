// SPDX-License-Identifier: Apache-2.0
//
// i18n checks (AGENTS.md §5, D12; Phase 11):
// 1. Every literal key used in the sources exists in the English catalog
//    (core: packages/i18n/en.json; apps: their src/en.json plus core).
// 2. Every shipped translation (packages/i18n/locales/*.json and
//    apps/nuci-app-*/src/locales/*.json) is complete: the same keys as
//    English, no empty values, the same {placeholders} per key.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
// t('key') / t("key"), and registry-style label: 'some.key' strings
const CALL = /\bt\(\s*['"]([a-z0-9_.-]+)['"]/g;
const LABEL = /\b(?:label|description|title):\s*'([a-z][a-z0-9_]*\.[a-z0-9_.-]+)'/g;
const PLACEHOLDER = /\{\w+\}/g;

function* files(dir) {
	if (!existsSync(dir)) return;
	for (const e of readdirSync(dir)) {
		const p = join(dir, e);
		if (statSync(p).isDirectory()) yield* files(p);
		else if (/\.(ts|svelte)$/.test(p) && !/\.test\.ts$/.test(p)) yield p;
	}
}

const core = read('packages/i18n/en.json');
const units = [
	{
		name: 'core',
		en: 'packages/i18n/en.json',
		dirs: ['apps/web/src', 'packages/ui/src'],
		locales: 'packages/i18n/locales',
	},
];
for (const d of readdirSync(join(ROOT, 'apps'))
	.filter((d) => d.startsWith('nuci-app-'))
	.sort())
	units.push({
		name: d,
		en: `apps/${d}/src/en.json`,
		dirs: [`apps/${d}/src`],
		locales: `apps/${d}/src/locales`,
	});

const problems = [];
for (const u of units) {
	const en = read(u.en);
	const known = u.name === 'core' ? en : { ...core, ...en };
	for (const dir of u.dirs)
		for (const file of files(join(ROOT, dir))) {
			const src = readFileSync(file, 'utf8');
			for (const re of [CALL, LABEL])
				for (const m of src.matchAll(re))
					if (!(m[1] in known))
						problems.push(
							`${u.name}: missing key ${m[1]} (${file.slice(ROOT.length + 1)})`,
						);
		}
	const dir = join(ROOT, u.locales);
	if (!existsSync(dir)) continue;
	for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
		const loc = JSON.parse(readFileSync(join(dir, f), 'utf8'));
		const tag = `${u.name}/${f}`;
		for (const k of Object.keys(en)) {
			if (!(k in loc)) problems.push(`${tag}: untranslated ${k}`);
			else if (typeof loc[k] !== 'string' || loc[k].trim() === '')
				problems.push(`${tag}: empty ${k}`);
			else {
				const a = (en[k].match(PLACEHOLDER) ?? []).sort().join();
				const b = (loc[k].match(PLACEHOLDER) ?? []).sort().join();
				if (a !== b) problems.push(`${tag}: placeholders of ${k} differ (${a} vs ${b})`);
			}
		}
		for (const k of Object.keys(loc)) if (!(k in en)) problems.push(`${tag}: unknown key ${k}`);
	}
}

if (problems.length) {
	console.error(`i18n problems (${problems.length}):`);
	for (const p of problems.slice(0, 200)) console.error(`  ${p}`);
	process.exit(1);
}
console.log(`i18n keys ok (${units.length} catalogs)`);
