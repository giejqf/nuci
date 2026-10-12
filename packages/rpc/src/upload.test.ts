// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { RpcClient } from './client';
import { mockFetch } from './test/mock-ubus';
import { downloadFile, UPLOAD_CHUNK, uploadFile } from './upload';

describe('uploadFile', () => {
	it('writes base64 chunks, appending after the first', async () => {
		const writes: Record<string, unknown>[] = [];
		const m = mockFetch((_sid, object, method, args) => {
			if (object === 'file' && method === 'write') writes.push(args);
			return {};
		});
		const client = new RpcClient({ fetch: m.fetch, storage: null });
		const bytes = new Uint8Array(UPLOAD_CHUNK * 2 + 10).map((_, i) => i % 251);
		const progress: number[] = [];
		await uploadFile(client, '/tmp/firmware.bin', new Blob([bytes]), (sent) =>
			progress.push(sent),
		);
		expect(writes.map((w) => w.append)).toEqual([false, true, true]);
		expect(writes.every((w) => w.base64 === true && w.path === '/tmp/firmware.bin')).toBe(true);
		const joined = Buffer.concat(writes.map((w) => Buffer.from(w.data as string, 'base64')));
		expect(joined.equals(Buffer.from(bytes))).toBe(true);
		expect(progress).toEqual([0, UPLOAD_CHUNK, UPLOAD_CHUNK * 2, UPLOAD_CHUNK * 2 + 10]);
	});

	it('creates empty files with one write', async () => {
		const writes: unknown[] = [];
		const m = mockFetch((_s, _o, _m, args) => (writes.push(args), {}));
		await uploadFile(new RpcClient({ fetch: m.fetch, storage: null }), '/tmp/x', new Blob([]));
		expect(writes).toHaveLength(1);
	});

	it('decodes downloads', async () => {
		const m = mockFetch(() => ({ data: Buffer.from('hello').toString('base64') }));
		const out = await downloadFile(new RpcClient({ fetch: m.fetch, storage: null }), '/tmp/b');
		expect(Buffer.from(out).toString()).toBe('hello');
	});
});
