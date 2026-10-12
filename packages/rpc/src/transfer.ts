// SPDX-License-Identifier: Apache-2.0
//
// Streaming transfers through /nuci/transfer (server/transfer.uc, ADR-0005):
// backups of any size and firmware/restore uploads without 45 KiB /ubus
// chunks. Files are named, never addressed by path; the session travels in
// the X-Nuci-Session header so it never lands in URLs or logs.

import type { RpcClient } from './client';
import { RpcError, UbusStatus } from './errors';

export type DownloadName = 'backup';
export type UploadName = 'restore' | 'firmware';

/** The handler URL next to the /ubus endpoint (`/ubus` -> `/nuci/transfer`). */
export function transferUrl(endpoint: string, name: string): string {
	const base = endpoint.replace(/\/ubus\/?$/, '') + '/nuci/transfer';
	return `${base}?name=${encodeURIComponent(name)}`;
}

function failure(status: number, name: string): RpcError {
	if (status === 403)
		return new RpcError('ubus', UbusStatus.PERMISSION_DENIED, 'nuci.transfer', name);
	if (status === 404) return new RpcError('ubus', UbusStatus.NOT_FOUND, 'nuci.transfer', name);
	if (status === 413)
		return new RpcError('ubus', UbusStatus.NO_DATA, 'nuci.transfer', name, 'not enough space');
	if (status === 0) return new RpcError('network', 0, 'nuci.transfer', name);
	return new RpcError('http', status, 'nuci.transfer', name);
}

export async function download(client: RpcClient, name: DownloadName): Promise<Blob> {
	let res: Response;
	try {
		res = await fetch(transferUrl(client.endpoint, name), {
			headers: { 'X-Nuci-Session': client.sid },
			cache: 'no-store',
		});
	} catch {
		throw failure(0, name);
	}
	if (!res.ok) throw failure(res.status, name);
	return res.blob();
}

/** Upload with progress (XHR: fetch has no upload progress). Resolves to the stored size. */
export function upload(
	client: RpcClient,
	name: UploadName,
	blob: Blob,
	onProgress?: (sent: number, total: number) => void,
): Promise<number> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', transferUrl(client.endpoint, name));
		xhr.setRequestHeader('X-Nuci-Session', client.sid);
		xhr.setRequestHeader('Content-Type', 'application/octet-stream');
		xhr.upload.onprogress = (e) =>
			onProgress?.(e.loaded, e.lengthComputable ? e.total : blob.size);
		xhr.onerror = () => reject(failure(0, name));
		xhr.onload = () => {
			if (xhr.status !== 200) return reject(failure(xhr.status, name));
			onProgress?.(blob.size, blob.size);
			try {
				resolve((JSON.parse(xhr.responseText) as { size: number }).size);
			} catch {
				reject(failure(500, name));
			}
		};
		onProgress?.(0, blob.size);
		xhr.send(blob);
	});
}
