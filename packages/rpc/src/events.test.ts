// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventHub, type Transport } from './events';

class FakeES {
	static instances: FakeES[] = [];
	url: string;
	readyState = 0;
	onopen: ((ev: Event) => unknown) | null = null;
	onerror: ((ev: Event) => unknown) | null = null;
	listeners = new Map<string, ((ev: MessageEvent<string>) => void)[]>();
	closed = false;
	constructor(url: string) {
		this.url = url;
		FakeES.instances.push(this);
	}
	addEventListener(type: string, fn: (ev: MessageEvent<string>) => void) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
	}
	close() {
		this.closed = true;
		this.readyState = 2;
	}
	open() {
		this.readyState = 1;
		this.onopen?.(new Event('open'));
	}
	emit(type: string, data: unknown, id = '') {
		const ev = new MessageEvent(type, { data: JSON.stringify(data), lastEventId: id });
		for (const fn of this.listeners.get(type) ?? []) fn(ev);
	}
	fail(fatal: boolean) {
		this.readyState = fatal ? 2 : 0;
		this.onerror?.(new Event('error'));
	}
}

class FakeDoc {
	visibilityState: DocumentVisibilityState = 'visible';
	#fns: (() => void)[] = [];
	addEventListener(_t: string, fn: () => void) {
		this.#fns.push(fn);
	}
	set(v: DocumentVisibilityState) {
		this.visibilityState = v;
		for (const f of this.#fns) f();
	}
}

const flush = () => new Promise<void>((r) => queueMicrotask(r));

describe('EventHub', () => {
	beforeEach(() => {
		FakeES.instances = [];
		vi.useFakeTimers();
	});
	afterEach(() => vi.useRealTimers());

	function hub(
		opts: { ES?: typeof FakeES | null; pollers?: Record<string, () => Promise<unknown>> } = {},
	) {
		const doc = new FakeDoc();
		const transports: Transport[] = [];
		const h = new EventHub({
			getSid: () => 'f'.repeat(32),
			pollers: opts.pollers ?? {},
			EventSource: opts.ES === undefined ? FakeES : opts.ES,
			document: doc as unknown as Document,
			onTransportChange: (t) => transports.push(t),
		});
		return { h, doc, transports };
	}

	it('opens one EventSource for all subscribed streams and dispatches events', async () => {
		const { h, transports } = hub();
		const stats = vi.fn();
		const beat = vi.fn();
		h.subscribe('stats', stats);
		h.subscribe('heartbeat', beat);
		await flush();
		expect(FakeES.instances).toHaveLength(1);
		const es = FakeES.instances[0]!;
		expect(es.url).toMatch(/^\/nuci\/events\?sid=f{32}&streams=heartbeat%2Cstats&interval=2$/);
		es.open();
		es.emit('stats', { load: [1, 2, 3] }, '7');
		es.emit('heartbeat', { t: 1 });
		expect(stats).toHaveBeenCalledWith({ load: [1, 2, 3] });
		expect(beat).toHaveBeenCalledWith({ t: 1 });
		expect(h.transport).toBe('sse');
		expect(transports).toEqual(['sse']);
	});

	it('reconnects with the last event id when the server ends a stream', async () => {
		const { h } = hub();
		h.subscribe('stats', () => {});
		await flush();
		const es = FakeES.instances[0]!;
		es.open();
		es.emit('stats', {}, '42');
		es.emit('end', { reconnect: true });
		await flush();
		expect(es.closed).toBe(true);
		expect(FakeES.instances).toHaveLength(2);
		expect(FakeES.instances[1]!.url).toContain('last=42');
	});

	it('falls back to polling after repeated SSE failures, without overlapping requests', async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		const poll = vi.fn(async () => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((r) => setTimeout(r, 3000)); // slower than the interval
			inFlight--;
			return { n: poll.mock.calls.length };
		});
		const { h, transports } = hub({ pollers: { stats: poll } });
		const handler = vi.fn();
		h.subscribe('stats', handler);
		await flush();
		FakeES.instances[0]!.fail(true);
		await flush();
		FakeES.instances[1]!.fail(true);
		await flush();
		expect(h.transport).toBe('poll');
		await vi.advanceTimersByTimeAsync(3000);
		expect(handler).toHaveBeenCalledWith({ n: 1 });
		await vi.advanceTimersByTimeAsync(2000 + 3000);
		expect(handler).toHaveBeenCalledTimes(2);
		expect(maxInFlight).toBe(1);
		expect(transports).toEqual(['poll']);
	});

	it('uses polling directly when EventSource is unavailable', async () => {
		const poll = vi.fn(async () => ({ ok: true }));
		const { h } = hub({ ES: null, pollers: { heartbeat: poll } });
		const handler = vi.fn();
		h.subscribe('heartbeat', handler);
		await flush();
		await vi.advanceTimersByTimeAsync(0);
		expect(handler).toHaveBeenCalledWith({ ok: true });
		expect(h.transport).toBe('poll');
	});

	it('keeps SSE across transient errors after a successful open', async () => {
		const { h } = hub();
		h.subscribe('stats', () => {});
		await flush();
		const es = FakeES.instances[0]!;
		es.open();
		es.fail(false); // browser is auto-reconnecting
		es.fail(false);
		await flush();
		expect(FakeES.instances).toHaveLength(1);
		expect(h.transport).toBe('sse');
	});

	it('pauses in hidden tabs and resumes when visible', async () => {
		const poll = vi.fn(async () => ({}));
		const { h, doc } = hub({ ES: null, pollers: { stats: poll } });
		h.subscribe('stats', () => {});
		await flush();
		await vi.advanceTimersByTimeAsync(0);
		expect(poll).toHaveBeenCalledTimes(1);
		doc.set('hidden');
		await flush();
		expect(h.transport).toBe('idle');
		await vi.advanceTimersByTimeAsync(10_000);
		expect(poll).toHaveBeenCalledTimes(1);
		doc.set('visible');
		await flush();
		await vi.advanceTimersByTimeAsync(0);
		expect(poll).toHaveBeenCalledTimes(2);
	});

	it('closes the stream when the last subscriber leaves', async () => {
		const { h } = hub();
		const off = h.subscribe('stats', () => {});
		await flush();
		off();
		await flush();
		expect(FakeES.instances[0]!.closed).toBe(true);
		expect(h.transport).toBe('idle');
	});
});

describe('EventHub stream parameters', () => {
	beforeEach(() => {
		FakeES.instances = [];
		vi.useFakeTimers();
	});
	afterEach(() => vi.useRealTimers());

	it('sends per-stream params on every (re)connect, read fresh each time', async () => {
		let after = 10;
		const h = new EventHub({
			getSid: () => 'f'.repeat(32),
			pollers: {},
			EventSource: FakeES,
			document: null,
		});
		h.subscribe(
			'syslog',
			(d: { entries: { id: number }[] }) => (after = d.entries.at(-1)!.id),
			{
				params: () => ({ after }),
			},
		);
		await flush();
		expect(FakeES.instances[0]!.url).toContain('syslog.after=10');
		FakeES.instances[0]!.open();
		FakeES.instances[0]!.emit('syslog', { entries: [{ id: 42 }] });
		FakeES.instances[0]!.emit('end', {});
		await flush();
		expect(FakeES.instances[1]!.url).toContain('syslog.after=42');
	});

	it('passes params to pollers and reports transport changes to listeners', async () => {
		const poll = vi.fn(async (p: Record<string, string | number>) => ({ entries: [], got: p }));
		const h = new EventHub({
			getSid: () => 'f'.repeat(32),
			pollers: { syslog: poll },
			EventSource: null,
			document: null,
		});
		const seen: string[] = [];
		h.onTransportChange((t) => seen.push(t));
		h.subscribe('syslog', () => {}, { params: () => ({ after: 7 }) });
		await flush();
		await vi.advanceTimersByTimeAsync(0);
		expect(poll).toHaveBeenCalledWith({ after: 7 });
		expect(seen).toEqual(['idle', 'poll']);
	});

	it('lets the same handler subscribe twice independently', async () => {
		const h = new EventHub({
			getSid: () => 'f'.repeat(32),
			pollers: {},
			EventSource: FakeES,
			document: null,
		});
		const fn = vi.fn();
		const off1 = h.subscribe('stats', fn);
		h.subscribe('stats', fn);
		off1();
		await flush();
		FakeES.instances.at(-1)!.open();
		FakeES.instances.at(-1)!.emit('stats', { a: 1 });
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
