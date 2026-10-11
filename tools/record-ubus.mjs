// SPDX-License-Identifier: Apache-2.0
//
// Record ubus request/response fixtures from the lab router into
// docs/ubus-contracts/<object>.json (AGENTS.md §8). Calls come from
// tools/ubus-calls.json; signatures from `ubus -v list` over ssh.
// Usage: node tools/record-ubus.mjs [object-prefix...]

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/ubus-contracts');
const NULL_SID = '0'.repeat(32);
const port = process.env.NUCI_HTTP_PORT ?? '8080';
const base = `http://127.0.0.1:${port}`;
const password = process.env.NUCI_ROOT_PASSWORD;
if (!password) throw new Error('NUCI_ROOT_PASSWORD not set (source tools/qemu/.env)');

const filters = process.argv.slice(2);
const { calls } = JSON.parse(readFileSync(join(ROOT, 'tools/ubus-calls.json'), 'utf8'));

async function rpc(sid, object, method, args) {
	const res = await fetch(`${base}/ubus`, {
		method: 'POST',
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'call',
			params: [sid, object, method, args],
		}),
	});
	return res.json();
}

function lab(cmd) {
	return execFileSync(
		'bash',
		['-c', `. tools/qemu/common.sh && lab_ssh ${JSON.stringify(cmd)}`],
		{
			cwd: ROOT,
			encoding: 'utf8',
		},
	);
}

/** Parse `ubus -v list <object>` into { method: { arg: type } }. */
function signature(object) {
	let text;
	try {
		text = lab(`ubus -v list ${object}`);
	} catch {
		return null;
	}
	const sig = {};
	for (const line of text.split('\n')) {
		const m = line.match(/^\s+"([^"]+)":(\{.*\})\s*$/);
		if (m) sig[m[1]] = JSON.parse(m[2]);
	}
	return sig;
}

const login = await rpc(NULL_SID, 'session', 'login', { username: 'root', password });
const sid = login.result?.[1]?.ubus_rpc_session;
if (!sid) throw new Error(`login failed: ${JSON.stringify(login)}`);
const release = (await rpc(NULL_SID, 'system', 'board', {})).result?.[1]?.release ?? {};

const byObject = new Map();
for (const [object, method, args] of calls) {
	if (filters.length && !filters.some((f) => object.startsWith(f))) continue;
	const reply = await rpc(sid, object, method, args);
	const entry = { method, args };
	if (reply.error) entry.error = reply.error;
	else {
		entry.status = reply.result[0];
		if (reply.result.length > 1) entry.result = reply.result[1];
	}
	if (!byObject.has(object)) byObject.set(object, []);
	byObject.get(object).push(entry);
}

mkdirSync(OUT, { recursive: true });
for (const [object, entries] of byObject) {
	const doc = {
		object,
		recorded: { release: release.version, revision: release.revision, target: release.target },
		signature: signature(object),
		calls: entries,
	};
	writeFileSync(join(OUT, `${object}.json`), JSON.stringify(doc, null, '\t') + '\n');
	console.log(`recorded ${object} (${entries.length} calls)`);
}
await rpc(sid, 'session', 'destroy', {});
