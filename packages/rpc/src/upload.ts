// SPDX-License-Identifier: Apache-2.0
//
// Upload a Blob to the router with `file.write` in base64 chunks (append).
// uhttpd-mod-ubus rejects request bodies over 64 KiB (UH_UBUS_MAX_POST_SIZE),
// so a chunk is 45 KiB: 60 KiB of base64 plus the JSON-RPC envelope.
// No cgi-io needed.

import type { RpcClient } from './client';

export const UPLOAD_CHUNK = 45 * 1024;

function toBase64(bytes: Uint8Array): string {
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000)
		bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(bin);
}

export async function uploadFile(
	client: RpcClient,
	path: string,
	blob: Blob,
	onProgress?: (sent: number, total: number) => void,
	mode = 0o600,
): Promise<void> {
	const total = blob.size;
	let sent = 0;
	onProgress?.(0, total);
	do {
		const chunk = new Uint8Array(await blob.slice(sent, sent + UPLOAD_CHUNK).arrayBuffer());
		await client.call('file', 'write', {
			path,
			data: toBase64(chunk),
			base64: true,
			append: sent > 0,
			mode,
		});
		sent += chunk.length;
		onProgress?.(sent, total);
	} while (sent < total);
}

/** Read a (small) file as bytes via `file.read` with base64. */
export async function downloadFile(
	client: RpcClient,
	path: string,
): Promise<Uint8Array<ArrayBuffer>> {
	const { data } = await client.call<{ data: string }>('file', 'read', { path, base64: true });
	const bin = atob(data);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
