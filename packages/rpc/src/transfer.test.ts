// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RpcClient } from './client';
import { download, transferUrl } from './transfer';

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
});
