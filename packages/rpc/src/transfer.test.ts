// SPDX-License-Identifier: Apache-2.0
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RpcClient } from './client';
import { download, nextChunk, transferUrl, upload } from './transfer';

/** Byte equality without a deep-equal walk over megabytes. */
const same = (a: Uint8Array | null, b: Uint8Array) => !!a && Buffer.from(a).equals(Buffer.from(b));

describe('transfer', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('derives the handler URL from the /ubus endpoint', () => {
		expect(transferUrl('/ubus', 'backup')).toBe('/nuci/transfer?name=backup');
		expect(transferUrl('http://10.0.0.1/ubus', 'firmware')).toBe(
			'http://10.0.0.1/nuci/transfer?name=firmware',
		);
	});

	it('sends the session in a header, never the URL, and maps 403', async () => {
		const client = new RpcClient({ endpoint: '/ubus', storage: null });
		const fetchMock = vi.fn(async () => new Response('{}', { status: 403 }));
		vi.stubGlobal('fetch', fetchMock);
		await expect(download(client, 'backup')).rejects.toMatchObject({
			isPermissionDenied: true,
		});
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('/nuci/transfer?name=backup');
		expect(url).not.toContain(client.sid);
		expect((init.headers as Record<string, string>)['X-Nuci-Session']).toBe(client.sid);
	});

	it('sizes chunks for about 15 s per request, growing at most 4x', () => {
		const MB = 1024 * 1024;
		expect(nextChunk(MB, 1000, MB)).toBe(4 * MB); // fast: capped growth
		expect(nextChunk(MB, 60_000, MB)).toBe(Math.floor((MB / 60_000) * 15_000));
		expect(nextChunk(10, 60_000, MB)).toBe(64 * 1024); // floor
		expect(nextChunk(64 * MB, 1, 16 * MB)).toBe(16 * MB); // ceiling
	});

	it('downloads in ranges and retries a cut range', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout'] });
		const client = new RpcClient({ endpoint: '/ubus', storage: null });
		const file = new Uint8Array(3 * 1024 * 1024).map((_, i) => i % 251);
		const ranges: string[] = [];
		let cut = true;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				const range = (init.headers as Record<string, string>).Range!;
				ranges.push(range);
				const [, a, b] = /bytes=(\d+)-(\d+)/.exec(range)!;
				if (Number(a) > 0 && cut) {
					cut = false;
					throw new TypeError('network error');
				}
				const end = Math.min(file.length - 1, Number(b));
				return new Response(file.slice(Number(a), end + 1), {
					status: 206,
					headers: { 'Content-Range': `bytes ${a}-${end}/${file.length}` },
				});
			}),
		);
		const progress: number[] = [];
		const p = download(client, 'backup', (r) => progress.push(r));
		await vi.runAllTimersAsync();
		const blob = await p;
		vi.useRealTimers();
		expect(same(new Uint8Array(await blob.arrayBuffer()), file)).toBe(true);
		expect(ranges[0]).toBe('bytes=0-1048575');
		expect(ranges.length).toBeGreaterThan(2);
		expect(progress.at(-1)).toBe(file.length);
	});
});

/** A router-side .part file behind a fake XMLHttpRequest. */
function fakeRouter(opts: { cutAt?: number; loseLastReply?: boolean } = {}) {
	const state = {
		part: new Uint8Array(0),
		stored: null as Uint8Array | null,
		requests: [] as string[],
	};
	class FakeXhr {
		upload: { onprogress?: (e: { loaded: number }) => void } = {};
		onload?: () => void;
		onerror?: () => void;
		status = 0;
		responseText = '';
		#url = '';
		open(_m: string, url: string) {
			this.#url = url;
		}
		setRequestHeader() {}
		async send(body: Blob) {
			state.requests.push(this.#url);
			const q = new URL(this.#url, 'http://router').searchParams;
			const offset = Number(q.get('offset'));
			const total = Number(q.get('total'));
			let bytes = new Uint8Array(await body.arrayBuffer());
			if (offset !== state.part.length && offset !== 0) {
				this.status = 409;
				this.responseText = JSON.stringify({
					error: 'offset_mismatch',
					size: state.part.length,
				});
				return this.onload?.();
			}
			if (offset === 0) {
				state.part = new Uint8Array(0);
				state.stored = null;
			}
			let cut = false;
			if (
				opts.cutAt !== undefined &&
				offset + bytes.length > opts.cutAt &&
				offset < opts.cutAt
			) {
				bytes = bytes.slice(0, opts.cutAt - offset);
				opts.cutAt = undefined;
				cut = true;
			}
			const next = new Uint8Array(state.part.length + bytes.length);
			next.set(state.part);
			next.set(bytes, state.part.length);
			state.part = next;
			if (cut) return this.onerror?.();
			const complete = state.part.length === total;
			if (complete) {
				state.stored = state.part;
				state.part = new Uint8Array(0);
				if (opts.loseLastReply) return this.onerror?.();
			}
			this.upload.onprogress?.({ loaded: bytes.length });
			this.status = 200;
			this.responseText = JSON.stringify({
				size: complete ? total : state.part.length,
				complete,
			});
			this.onload?.();
		}
	}
	const fetchStatus = vi.fn(async () =>
		Response.json({ part: state.part.length, stored: state.stored?.length ?? null }),
	);
	vi.stubGlobal('XMLHttpRequest', FakeXhr);
	vi.stubGlobal('fetch', fetchStatus);
	return { state, fetchStatus };
}

describe('resumable upload', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});
	const file = new Uint8Array(5 * 1024 * 1024 + 123).map((_, i) => (i * 7) % 256);

	it('sends chunks at increasing offsets and resolves to the stored size', async () => {
		const router = fakeRouter();
		const client = new RpcClient({ endpoint: '/ubus', storage: null });
		const size = await upload(client, 'firmware', new Blob([file]));
		expect(size).toBe(file.length);
		expect(same(router.state.stored, file)).toBe(true);
		expect(router.state.requests[0]).toBe(
			`/nuci/transfer?name=firmware&offset=0&total=${file.length}`,
		);
		expect(router.state.requests.length).toBeGreaterThan(1);
	});

	it('resumes after a cut connection from what the router received', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout'] });
		const router = fakeRouter({ cutAt: 1024 * 1024 + 5000 });
		const client = new RpcClient({ endpoint: '/ubus', storage: null });
		const p = upload(client, 'firmware', new Blob([file]));
		await vi.runAllTimersAsync();
		expect(await p).toBe(file.length);
		expect(same(router.state.stored, file)).toBe(true);
		expect(router.fetchStatus).toHaveBeenCalledWith(
			'/nuci/transfer?name=firmware&status',
			expect.anything(),
		);
		expect(router.state.requests).toContain(
			`/nuci/transfer?name=firmware&offset=${1024 * 1024 + 5000}&total=${file.length}`,
		);
	});

	it('a lost reply to the last chunk still completes', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout'] });
		const router = fakeRouter({ loseLastReply: true });
		const client = new RpcClient({ endpoint: '/ubus', storage: null });
		const p = upload(client, 'firmware', new Blob([file]));
		await vi.runAllTimersAsync();
		expect(await p).toBe(file.length);
		expect(same(router.state.stored, file)).toBe(true);
	});

	it('gives up on errors that a retry cannot fix', async () => {
		vi.stubGlobal(
			'XMLHttpRequest',
			class {
				upload = {};
				status = 413;
				responseText = '{"error":"no_space"}';
				onload?: () => void;
				open() {}
				setRequestHeader() {}
				send() {
					this.onload?.();
				}
			},
		);
		const client = new RpcClient({ endpoint: '/ubus', storage: null });
		await expect(upload(client, 'firmware', new Blob([file]))).rejects.toThrow(
			'not enough space',
		);
	});
});
