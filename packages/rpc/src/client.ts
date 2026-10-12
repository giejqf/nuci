// SPDX-License-Identifier: Apache-2.0
//
// ubus JSON-RPC client for uhttpd-mod-ubus (/ubus). Calls issued in the same
// microtask are sent as one JSON-RPC batch. An "Access denied" on a session
// that turns out to be expired triggers `onSessionExpired` (the UI's re-login)
// and the call is retried once with the new session.

import { JsonRpcCode, RpcError } from './errors';

export const NULL_SESSION = '00000000000000000000000000000000';

/** uhttpd-mod-ubus rejects bodies over 64 KiB; batches are split below this. */
export const MAX_REQUEST_BYTES = 60_000;
export const SESSION_STORAGE_KEY = 'nuci.session';

export type Args = Record<string, unknown>;

export interface ClientOptions {
	/** JSON-RPC endpoint (default `/ubus`, resolved against the page). */
	endpoint?: string;
	fetch?: typeof fetch;
	/** Where the session token lives (D11: sessionStorage). */
	storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
	/** Per-request timeout in ms (default 30 000). */
	timeoutMs?: number;
	/**
	 * Called when the session expired mid-use. Resolve `true` once the user
	 * logged in again (the failed call is retried), `false` to give up.
	 */
	onSessionExpired?: () => Promise<boolean>;
}

interface Pending {
	id: number;
	object: string;
	method: string;
	args: Args;
	sid: string;
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
}

interface JsonRpcReply {
	jsonrpc?: string;
	id?: number | null;
	result?: unknown;
	error?: { code: number; message: string };
}

function defaultStorage(): ClientOptions['storage'] {
	try {
		return globalThis.sessionStorage ?? null;
	} catch {
		return null;
	}
}

export class RpcClient {
	readonly endpoint: string;
	#fetch: typeof fetch | undefined;
	#storage: ClientOptions['storage'];
	#timeoutMs: number;
	#queue: Pending[] = [];
	#scheduled = false;
	#nextId = 1;
	#sid: string;
	#expiryHandler: ClientOptions['onSessionExpired'];
	#relogin: Promise<boolean> | null = null;
	#listeners = new Set<(sid: string) => void>();

	constructor(options: ClientOptions = {}) {
		this.endpoint = options.endpoint ?? '/ubus';
		this.#fetch = options.fetch;
		this.#storage = options.storage === undefined ? defaultStorage() : options.storage;
		this.#timeoutMs = options.timeoutMs ?? 30_000;
		this.#expiryHandler = options.onSessionExpired;
		this.#sid = this.#readStoredSid();
	}

	/** Current session id (the null session when logged out). */
	get sid(): string {
		return this.#sid;
	}

	get authenticated(): boolean {
		return this.#sid !== NULL_SESSION;
	}

	setSession(sid: string | null): void {
		this.#sid = sid && /^[0-9a-f]{32}$/.test(sid) ? sid : NULL_SESSION;
		try {
			if (this.#sid === NULL_SESSION) this.#storage?.removeItem(SESSION_STORAGE_KEY);
			else this.#storage?.setItem(SESSION_STORAGE_KEY, this.#sid);
		} catch {
			// Storage can be unavailable; the session still works for this page.
		}
		for (const l of this.#listeners) l(this.#sid);
	}

	/** Observe session changes (login, logout, expiry). Returns an unsubscribe function. */
	onSessionChange(listener: (sid: string) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	set onSessionExpired(handler: ClientOptions['onSessionExpired']) {
		this.#expiryHandler = handler;
	}

	/** Call `object.method` with the current session. */
	call<T = unknown>(object: string, method: string, args: Args = {}): Promise<T> {
		return this.#callWithRetry<T>(object, method, args, this.#sid, true);
	}

	/** Call with the null session (pre-login: session.login, system.board). */
	callAnonymous<T = unknown>(object: string, method: string, args: Args = {}): Promise<T> {
		return this.#enqueue<T>(object, method, args, NULL_SESSION);
	}

	async #callWithRetry<T>(
		object: string,
		method: string,
		args: Args,
		sid: string,
		mayRetry: boolean,
	): Promise<T> {
		try {
			return await this.#enqueue<T>(object, method, args, sid);
		} catch (e) {
			if (
				!mayRetry ||
				sid === NULL_SESSION ||
				!(e instanceof RpcError) ||
				e.kind !== 'jsonrpc' ||
				(e.code !== JsonRpcCode.ACCESS_DENIED && e.code !== JsonRpcCode.SESSION_NOT_FOUND)
			)
				throw e;
			if (await this.#sessionAlive(sid)) throw e; // a real ACL denial
			if (this.#sid === sid) this.setSession(null);
			if (!(await this.#reauthenticate()))
				throw new RpcError('session', e.code, object, method, 'session expired');
			return this.#callWithRetry<T>(object, method, args, this.#sid, false);
		}
	}

	/** Whether `sid` is still a live session (it can query its own ACLs). */
	async #sessionAlive(sid: string): Promise<boolean> {
		try {
			await this.#enqueue('session', 'access', {}, sid);
			return true;
		} catch {
			return false;
		}
	}

	#reauthenticate(): Promise<boolean> {
		if (!this.#expiryHandler) return Promise.resolve(false);
		// Concurrent failures share one re-login prompt.
		this.#relogin ??= this.#expiryHandler()
			.catch(() => false)
			.then((ok) => ok && this.authenticated)
			.finally(() => (this.#relogin = null));
		return this.#relogin;
	}

	#enqueue<T>(object: string, method: string, args: Args, sid: string): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.#queue.push({
				id: this.#nextId++,
				object,
				method,
				args,
				sid,
				resolve: resolve as (v: unknown) => void,
				reject,
			});
			if (!this.#scheduled) {
				this.#scheduled = true;
				queueMicrotask(() => this.#flush());
			}
		});
	}

	async #flush(): Promise<void> {
		const batch = this.#queue;
		this.#queue = [];
		this.#scheduled = false;
		if (!batch.length) return;

		// Split into requests that stay under uhttpd's body limit.
		const groups: { calls: Pending[]; bodies: unknown[]; size: number }[] = [];
		for (const p of batch) {
			const body = {
				jsonrpc: '2.0',
				id: p.id,
				method: 'call',
				params: [p.sid, p.object, p.method, p.args],
			};
			const size = JSON.stringify(body).length + 1;
			const last = groups.at(-1);
			if (last && last.size + size <= MAX_REQUEST_BYTES) {
				last.calls.push(p);
				last.bodies.push(body);
				last.size += size;
			} else {
				groups.push({ calls: [p], bodies: [body], size: size + 2 });
			}
		}
		await Promise.all(groups.map((g) => this.#send(g.calls, g.bodies)));
	}

	async #send(batch: Pending[], body: unknown[]): Promise<void> {
		let replies: JsonRpcReply[];
		try {
			replies = await this.#post(batch.length === 1 ? body[0] : body);
		} catch (e) {
			for (const p of batch) {
				p.reject(
					e instanceof RpcError
						? new RpcError(e.kind, e.code, p.object, p.method, e.message)
						: new RpcError('network', 0, p.object, p.method, String(e)),
				);
			}
			return;
		}

		const byId = new Map<number, JsonRpcReply>();
		for (const r of replies) if (typeof r.id === 'number') byId.set(r.id, r);

		for (const p of batch) {
			const reply = byId.get(p.id) ?? (batch.length === 1 ? replies[0] : undefined);
			settle(p, reply);
		}
	}

	async #post(body: unknown): Promise<JsonRpcReply[]> {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), this.#timeoutMs);
		let res: Response;
		try {
			// Resolved per request so polyfills/stubs installed later are honored.
			const doFetch = this.#fetch ?? globalThis.fetch.bind(globalThis);
			res = await doFetch(this.endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
				signal: ctrl.signal,
				credentials: 'omit',
			});
		} catch (e) {
			throw new RpcError(
				'network',
				0,
				'',
				'',
				ctrl.signal.aborted ? 'request timed out' : String(e),
			);
		} finally {
			clearTimeout(timer);
		}
		let json: unknown;
		try {
			json = await res.json();
		} catch {
			throw new RpcError('http', res.status, '', '', `HTTP ${res.status}`);
		}
		if (Array.isArray(json)) return json as JsonRpcReply[];
		if (json && typeof json === 'object') return [json as JsonRpcReply];
		throw new RpcError('http', res.status, '', '', `HTTP ${res.status}`);
	}

	#readStoredSid(): string {
		try {
			const v = this.#storage?.getItem(SESSION_STORAGE_KEY);
			return v && /^[0-9a-f]{32}$/.test(v) ? v : NULL_SESSION;
		} catch {
			return NULL_SESSION;
		}
	}
}

function settle(p: Pending, reply: JsonRpcReply | undefined): void {
	if (!reply) {
		p.reject(
			new RpcError('jsonrpc', JsonRpcCode.INTERNAL_ERROR, p.object, p.method, 'no reply'),
		);
		return;
	}
	if (reply.error) {
		p.reject(
			new RpcError('jsonrpc', reply.error.code, p.object, p.method, reply.error.message),
		);
		return;
	}
	const result = reply.result;
	if (!Array.isArray(result) || typeof result[0] !== 'number') {
		p.reject(
			new RpcError(
				'jsonrpc',
				JsonRpcCode.INTERNAL_ERROR,
				p.object,
				p.method,
				'malformed result',
			),
		);
		return;
	}
	const [status, data] = result as [number, unknown];
	if (status !== 0) {
		p.reject(new RpcError('ubus', status, p.object, p.method));
		return;
	}
	p.resolve(data ?? {});
}
