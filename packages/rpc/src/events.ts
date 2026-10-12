// SPDX-License-Identifier: Apache-2.0
//
// Realtime streams (D18, ADR-0001): one EventSource per tab to /nuci/events,
// transparently replaced by ubus polling when SSE is unavailable. Pages call
// subscribe() and never learn which transport is active. Nothing runs while
// the tab is hidden.

import type { RealtimeStats } from './nuci-types';

export interface StreamPayloads {
	heartbeat: { t: number; uptime: number };
	stats: RealtimeStats;
}

export type StreamName = keyof StreamPayloads | (string & {});
export type Transport = 'sse' | 'poll' | 'idle';
export type StreamParams = Record<string, string | number>;
export type Poller = (params: StreamParams) => Promise<unknown>;
export type StreamHandler<T> = (data: T) => void;

export interface SubscribeOptions {
	/**
	 * Per-stream parameters, read at every (re)connect and poll, e.g. a log
	 * cursor `{ after: lastId }`. Sent to SSE as `<stream>.<key>=<value>`.
	 */
	params?: () => StreamParams;
}

interface EventSourceLike {
	readonly readyState: number;
	onopen: ((ev: Event) => unknown) | null;
	onerror: ((ev: Event) => unknown) | null;
	addEventListener(type: string, listener: (ev: MessageEvent<string>) => void): void;
	close(): void;
}
type EventSourceCtor = new (url: string) => EventSourceLike;
type VisibilityDoc = Pick<Document, 'visibilityState' | 'addEventListener'>;

export interface EventHubOptions {
	/** SSE endpoint (default `/nuci/events`). */
	url?: string;
	/** Current session id. */
	getSid: () => string;
	/** How to fetch each stream's payload over ubus when SSE is unavailable. */
	pollers: Partial<Record<StreamName, Poller>>;
	/** Interval between samples for both transports (default 2000 ms). */
	intervalMs?: number;
	/** Consecutive SSE failures before falling back to polling (default 2). */
	maxSseFailures?: number;
	EventSource?: EventSourceCtor | null;
	document?: VisibilityDoc | null;
	onTransportChange?: (transport: Transport) => void;
}

const CLOSED = 2;

export class EventHub {
	#opts: Required<Pick<EventHubOptions, 'url' | 'intervalMs' | 'maxSseFailures'>> &
		EventHubOptions;
	#subs = new Map<string, Set<StreamHandler<unknown>>>();
	#params = new Map<StreamHandler<unknown>, () => StreamParams>();
	#transportListeners = new Set<(t: Transport) => void>();
	#transport: Transport = 'idle';
	#es: EventSourceLike | null = null;
	#esStreams = '';
	#sseFailures = 0;
	#sseDisabled: boolean;
	#lastId = '';
	#pollTimer: ReturnType<typeof setTimeout> | null = null;
	#polling = false;
	#reconcileQueued = false;
	#ES: EventSourceCtor | null;
	#doc: VisibilityDoc | null;

	constructor(options: EventHubOptions) {
		this.#opts = { url: '/nuci/events', intervalMs: 2000, maxSseFailures: 2, ...options };
		this.#ES =
			options.EventSource !== undefined
				? options.EventSource
				: ((globalThis as { EventSource?: EventSourceCtor }).EventSource ?? null);
		this.#doc =
			options.document !== undefined ? options.document : (globalThis.document ?? null);
		this.#sseDisabled = !this.#ES;
		this.#doc?.addEventListener('visibilitychange', () => this.#reconcile());
	}

	get transport(): Transport {
		return this.#transport;
	}

	subscribe<K extends keyof StreamPayloads>(
		stream: K,
		handler: StreamHandler<StreamPayloads[K]>,
		opts?: SubscribeOptions,
	): () => void;
	subscribe<T = unknown>(
		stream: string,
		handler: StreamHandler<T>,
		opts?: SubscribeOptions,
	): () => void;
	subscribe(
		stream: string,
		handler: StreamHandler<unknown>,
		opts?: SubscribeOptions,
	): () => void {
		// Each subscription gets its own wrapper so the same handler can subscribe twice.
		const h: StreamHandler<unknown> = (d) => handler(d);
		let set = this.#subs.get(stream);
		if (!set) this.#subs.set(stream, (set = new Set()));
		set.add(h);
		if (opts?.params) this.#params.set(h, opts.params);
		this.#reconcile();
		return () => {
			const s = this.#subs.get(stream);
			if (!s) return;
			s.delete(h);
			this.#params.delete(h);
			if (!s.size) this.#subs.delete(stream);
			this.#reconcile();
		};
	}

	/** Observe transport changes. Returns an unsubscribe function. */
	onTransportChange(listener: (t: Transport) => void): () => void {
		this.#transportListeners.add(listener);
		listener(this.#transport);
		return () => this.#transportListeners.delete(listener);
	}

	/** Parameters for a stream: those of its first subscriber that has any. */
	#streamParams(stream: string): StreamParams {
		for (const h of this.#subs.get(stream) ?? []) {
			const p = this.#params.get(h);
			if (p) return p();
		}
		return {};
	}

	/** Re-evaluate the transport (e.g. after login): SSE is tried again. */
	reset(): void {
		this.#sseFailures = 0;
		this.#sseDisabled = !this.#ES;
		this.#closeSse();
		this.#stopPolling();
		this.#reconcile();
	}

	/** Stop everything (logout). Subscriptions are kept for the next session. */
	stop(): void {
		this.#closeSse();
		this.#stopPolling();
		this.#setTransport('idle');
	}

	#visible(): boolean {
		return !this.#doc || this.#doc.visibilityState !== 'hidden';
	}

	#reconcile(): void {
		if (this.#reconcileQueued) return;
		this.#reconcileQueued = true;
		queueMicrotask(() => {
			this.#reconcileQueued = false;
			this.#apply();
		});
	}

	#apply(): void {
		const streams = [...this.#subs.keys()].sort();
		if (!streams.length || !this.#visible()) {
			this.stop();
			return;
		}
		if (!this.#sseDisabled) {
			this.#stopPolling();
			const key = streams.join(',');
			if (!this.#es || this.#esStreams !== key) this.#openSse(key);
			return;
		}
		this.#closeSse();
		this.#startPolling();
	}

	#dispatch(stream: string, data: unknown): void {
		for (const h of this.#subs.get(stream) ?? []) {
			try {
				h(data);
			} catch (e) {
				console.error(`nuci events: ${stream} handler failed`, e);
			}
		}
	}

	#setTransport(t: Transport): void {
		if (this.#transport === t) return;
		this.#transport = t;
		this.#opts.onTransportChange?.(t);
		for (const l of this.#transportListeners) l(t);
	}

	// --- SSE ---------------------------------------------------------------

	#openSse(streams: string): void {
		this.#closeSse();
		const ES = this.#ES;
		if (!ES) return;
		const params = new URLSearchParams({
			sid: this.#opts.getSid(),
			streams,
			interval: String(Math.max(1, Math.round(this.#opts.intervalMs / 1000))),
		});
		if (this.#lastId) params.set('last', this.#lastId);
		for (const stream of streams.split(','))
			for (const [k, v] of Object.entries(this.#streamParams(stream)))
				params.set(`${stream}.${k}`, String(v));
		let es: EventSourceLike;
		try {
			es = new ES(`${this.#opts.url}?${params}`);
		} catch {
			this.#sseFailed();
			return;
		}
		this.#es = es;
		this.#esStreams = streams;
		let opened = false;

		es.onopen = () => {
			opened = true;
			this.#sseFailures = 0;
			this.#setTransport('sse');
		};
		es.onerror = () => {
			if (this.#es !== es) return;
			// Fatal (HTTP error, wrong content type) or never connected: count it.
			if (es.readyState === CLOSED || !opened) this.#sseFailed();
		};
		for (const stream of streams.split(',')) {
			es.addEventListener(stream, (me) => {
				if (me.lastEventId) this.#lastId = me.lastEventId;
				let data: unknown;
				try {
					data = JSON.parse(me.data);
				} catch {
					return;
				}
				this.#dispatch(stream, data);
			});
		}
		// The server ends every stream before uhttpd's script_timeout (ADR-0001).
		es.addEventListener('end', () => {
			if (this.#es !== es) return;
			this.#closeSse();
			this.#reconcile();
		});
	}

	#sseFailed(): void {
		this.#closeSse();
		this.#sseFailures++;
		if (this.#sseFailures >= this.#opts.maxSseFailures) this.#sseDisabled = true;
		this.#reconcile();
	}

	#closeSse(): void {
		if (this.#es) {
			this.#es.onopen = null;
			this.#es.onerror = null;
			this.#es.close();
		}
		this.#es = null;
		this.#esStreams = '';
	}

	// --- Polling -----------------------------------------------------------

	#startPolling(): void {
		this.#setTransport('poll');
		if (this.#polling) return;
		this.#polling = true;
		void this.#tick();
	}

	#stopPolling(): void {
		this.#polling = false;
		if (this.#pollTimer) clearTimeout(this.#pollTimer);
		this.#pollTimer = null;
	}

	async #tick(): Promise<void> {
		this.#pollTimer = null;
		if (!this.#polling) return;
		const jobs = [...this.#subs.keys()].flatMap((stream) => {
			const poll = this.#opts.pollers[stream];
			return poll
				? [poll(this.#streamParams(stream)).then((data) => this.#dispatch(stream, data))]
				: [];
		});
		// Calls issued together share one JSON-RPC batch; the next tick is
		// scheduled only after this one finished, so requests never overlap.
		await Promise.allSettled(jobs);
		if (this.#polling)
			this.#pollTimer = setTimeout(() => void this.#tick(), this.#opts.intervalMs);
	}
}
