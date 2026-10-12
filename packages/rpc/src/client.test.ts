// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { NULL_SESSION, RpcClient, SESSION_STORAGE_KEY } from './client';
import { RpcError } from './errors';
import { memoryStorage, mockFetch } from './test/mock-ubus';

const SID = 'a'.repeat(32);

describe('RpcClient', () => {
	it('sends a single call as one JSON-RPC object', async () => {
		const m = mockFetch(() => ({ hello: 'world' }));
		const c = new RpcClient({ fetch: m.fetch, storage: null });
		await expect(c.call('system', 'info')).resolves.toEqual({ hello: 'world' });
		expect(m.requests).toHaveLength(1);
		expect(m.requests[0]).toMatchObject({
			jsonrpc: '2.0',
			method: 'call',
			params: [NULL_SESSION, 'system', 'info', {}],
		});
	});

	it('batches concurrent calls into one request and routes replies by id', async () => {
		const m = mockFetch((_s, object, method) => ({ object, method }));
		const c = new RpcClient({ fetch: m.fetch, storage: null });
		const [a, b, d] = await Promise.all([
			c.call('a', 'x'),
			c.call('b', 'y'),
			c.call('d', 'z', { k: 1 }),
		]);
		expect(m.requests).toHaveLength(1);
		expect(Array.isArray(m.requests[0])).toBe(true);
		expect([a, b, d]).toEqual([
			{ object: 'a', method: 'x' },
			{ object: 'b', method: 'y' },
			{ object: 'd', method: 'z' },
		]);
	});

	it('maps ubus status codes and JSON-RPC errors to RpcError', async () => {
		const m = mockFetch((_s, object) =>
			object === 'ubus'
				? { result: [4] }
				: { error: { code: -32002, message: 'Access denied' } },
		);
		const c = new RpcClient({ fetch: m.fetch, storage: null });
		const e1 = await c.call('ubus', 'm').catch((e: unknown) => e);
		expect(e1).toBeInstanceOf(RpcError);
		expect(e1).toMatchObject({
			kind: 'ubus',
			code: 4,
			messageKey: 'rpc.error.not_found',
			isNotFound: true,
		});
		const e2 = await c.callAnonymous('json', 'm').catch((e: unknown) => e);
		expect(e2).toMatchObject({ kind: 'jsonrpc', code: -32002, isPermissionDenied: true });
	});

	it('maps network failures and non-JSON replies', async () => {
		const c1 = new RpcClient({
			fetch: (async () => Promise.reject(new TypeError('down'))) as typeof fetch,
			storage: null,
		});
		await expect(c1.call('a', 'b')).rejects.toMatchObject({
			kind: 'network',
			messageKey: 'rpc.error.network',
		});
		const c2 = new RpcClient({
			fetch: (async () => new Response('<html>', { status: 502 })) as typeof fetch,
			storage: null,
		});
		await expect(c2.call('a', 'b')).rejects.toMatchObject({ kind: 'http', code: 502 });
	});

	it('resolves empty replies (status only) to {}', async () => {
		const c = new RpcClient({ fetch: mockFetch(() => ({ result: [0] })).fetch, storage: null });
		await expect(c.call('uci', 'confirm')).resolves.toEqual({});
	});

	it('persists the session in storage and ignores malformed tokens', () => {
		const storage = memoryStorage();
		const c = new RpcClient({ fetch: mockFetch(() => ({})).fetch, storage });
		c.setSession(SID);
		expect(storage.getItem(SESSION_STORAGE_KEY)).toBe(SID);
		expect(new RpcClient({ storage }).sid).toBe(SID);
		c.setSession('not-a-sid');
		expect(c.sid).toBe(NULL_SESSION);
		expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
	});

	it('re-logs in once when the session expired and retries the call', async () => {
		const NEW = 'b'.repeat(32);
		const m = mockFetch((sid, object, method) => {
			if (sid !== NEW) return { error: { code: -32002, message: 'Access denied' } };
			return { object, method };
		});
		const c = new RpcClient({ fetch: m.fetch, storage: null });
		c.setSession(SID);
		const onSessionExpired = vi.fn(async () => {
			c.setSession(NEW);
			return true;
		});
		c.onSessionExpired = onSessionExpired;
		const [r1, r2] = await Promise.all([c.call('system', 'info'), c.call('uci', 'get')]);
		expect(r1).toEqual({ object: 'system', method: 'info' });
		expect(r2).toEqual({ object: 'uci', method: 'get' });
		expect(onSessionExpired).toHaveBeenCalledTimes(1);
	});

	it('does not prompt for re-login on a real ACL denial', async () => {
		const m = mockFetch((_sid, object) =>
			object === 'session'
				? { 'access-group': {} }
				: { error: { code: -32002, message: 'Access denied' } },
		);
		const c = new RpcClient({ fetch: m.fetch, storage: null });
		c.setSession(SID);
		const onSessionExpired = vi.fn(async () => true);
		c.onSessionExpired = onSessionExpired;
		await expect(c.call('file', 'exec')).rejects.toMatchObject({ isPermissionDenied: true });
		expect(onSessionExpired).not.toHaveBeenCalled();
		expect(c.sid).toBe(SID);
	});

	it('rejects with a session error when re-login is declined', async () => {
		const m = mockFetch(() => ({ error: { code: -32002, message: 'Access denied' } }));
		const c = new RpcClient({
			fetch: m.fetch,
			storage: null,
			onSessionExpired: async () => false,
		});
		c.setSession(SID);
		await expect(c.call('system', 'info')).rejects.toMatchObject({
			kind: 'session',
			messageKey: 'rpc.error.session_expired',
		});
		expect(c.sid).toBe(NULL_SESSION);
	});
});
