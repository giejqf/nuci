// SPDX-License-Identifier: Apache-2.0
// A fake /ubus endpoint for tests, optionally answering from recorded fixtures.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type Handler = (
	sid: string,
	object: string,
	method: string,
	args: Record<string, unknown>,
) => unknown;

interface Fixture {
	object: string;
	calls: {
		method: string;
		args: Record<string, unknown>;
		status?: number;
		result?: unknown;
		error?: unknown;
	}[];
}

const CONTRACTS = join(import.meta.dirname, '../../../../docs/ubus-contracts');

export function loadFixtures(): Map<string, Fixture> {
	const map = new Map<string, Fixture>();
	for (const f of readdirSync(CONTRACTS)) {
		if (!f.endsWith('.json')) continue;
		const fx = JSON.parse(readFileSync(join(CONTRACTS, f), 'utf8')) as Fixture;
		map.set(fx.object, fx);
	}
	return map;
}

/** Reply exactly like uhttpd would for a recorded call. */
export function fixtureHandler(fixtures = loadFixtures()): Handler {
	return (_sid, object, method, args) => {
		const call = fixtures
			.get(object)
			?.calls.find(
				(c) => c.method === method && JSON.stringify(c.args) === JSON.stringify(args),
			);
		if (!call) return { error: { code: -32000, message: 'Object not found' } };
		if (call.error) return { error: call.error };
		return { result: call.result === undefined ? [call.status] : [call.status, call.result] };
	};
}

export interface MockFetch {
	fetch: typeof fetch;
	requests: unknown[];
}

/** handler returns `{ result }`, `{ error }`, or a plain value (wrapped as [0, value]). */
export function mockFetch(handler: Handler): MockFetch {
	const requests: unknown[] = [];
	const answer = (req: {
		id: number;
		params: [string, string, string, Record<string, unknown>];
	}) => {
		const [sid, object, method, args] = req.params;
		const out = handler(sid, object, method, args) as
			{ result?: unknown; error?: unknown } | undefined;
		if (out && typeof out === 'object' && ('result' in out || 'error' in out))
			return { jsonrpc: '2.0', id: req.id, ...out };
		return { jsonrpc: '2.0', id: req.id, result: out === undefined ? [0] : [0, out] };
	};
	const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body));
		requests.push(body);
		const reply = Array.isArray(body) ? body.map(answer) : answer(body);
		return new Response(JSON.stringify(reply), {
			headers: { 'Content-Type': 'application/json' },
		});
	}) as typeof fetch;
	return { fetch: fetchImpl, requests };
}

export function memoryStorage(): Storage {
	const m = new Map<string, string>();
	return {
		getItem: (k) => m.get(k) ?? null,
		setItem: (k, v) => void m.set(k, v),
		removeItem: (k) => void m.delete(k),
		clear: () => m.clear(),
		key: (i) => [...m.keys()][i] ?? null,
		get length() {
			return m.size;
		},
	};
}
