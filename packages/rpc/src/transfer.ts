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

// Each request is sized to take about TARGET_MS, far below uhttpd's
// script_timeout (60 s, which kills the handler), so a slow link moves a
// file of any size in several requests; a cut one resumes where the router is.
const TARGET_MS = 15_000;
const FIRST_CHUNK = 1024 * 1024;
const MIN_CHUNK = 64 * 1024;
const MAX_CHUNK = 16 * 1024 * 1024;
/** Failed requests in a row (without progress) before giving up. */
export const MAX_RETRIES = 5;

/** Next chunk size from the last request's throughput (at most 4x larger). */
export function nextChunk(bytes: number, ms: number, current: number): number {
	const fit = ms > 0 ? Math.floor((bytes / ms) * TARGET_MS) : current * 4;
	return Math.max(MIN_CHUNK, Math.min(MAX_CHUNK, current * 4, fit));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (failures: number) => Math.min(500 * 2 ** failures, 8000);

/** Download in ranges (resumable). Progress reports bytes received of the total. */
export async function download(
	client: RpcClient,
	name: DownloadName,
	onProgress?: (received: number, total: number) => void,
): Promise<Blob> {
	const url = transferUrl(client.endpoint, name);
	const parts: Blob[] = [];
	let offset = 0;
	let total: number | null = null;
	let chunk = FIRST_CHUNK;
	let failures = 0;
	let type = '';
	while (total === null || offset < total) {
		const t0 = performance.now();
		let blob: Blob;
		try {
			const res = await fetch(url, {
				headers: {
					'X-Nuci-Session': client.sid,
					Range: `bytes=${offset}-${offset + chunk - 1}`,
				},
				cache: 'no-store',
			});
			// An empty file has no satisfiable range.
			if (res.status === 416 && offset === 0) return new Blob([]);
			// The whole file at once (a handler without range support).
			if (res.status === 200) return await res.blob();
			if (res.status !== 206) throw failure(res.status, name);
			total = Number(/\/(\d+)$/.exec(res.headers.get('Content-Range') ?? '')?.[1] ?? NaN);
			if (!Number.isFinite(total)) throw failure(500, name);
			type = res.headers.get('Content-Type') ?? type;
			blob = await res.blob();
		} catch (e) {
			if (e instanceof RpcError && e.kind !== 'network') throw e;
			// Network error or a body cut short (e.g. the handler was killed): retry.
			if (++failures > MAX_RETRIES) throw failure(0, name);
			chunk = Math.max(MIN_CHUNK, Math.floor(chunk / 4));
			await sleep(backoff(failures));
			continue;
		}
		if (blob.size === 0) throw failure(500, name);
		parts.push(blob);
		offset += blob.size;
		failures = 0;
		chunk = nextChunk(blob.size, performance.now() - t0, chunk);
		onProgress?.(offset, total);
	}
	return new Blob(parts, type ? { type } : {});
}

interface Sent {
	/** HTTP status, 0 for a network error. */
	status: number;
	body: { size?: number; complete?: boolean; error?: string } | null;
}

/** One upload request (XHR: fetch has no upload progress). */
function send(
	client: RpcClient,
	url: string,
	body: Blob,
	onSent: (sent: number) => void,
): Promise<Sent> {
	return new Promise((resolve) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', url);
		xhr.setRequestHeader('X-Nuci-Session', client.sid);
		xhr.setRequestHeader('Content-Type', 'application/octet-stream');
		xhr.upload.onprogress = (e) => onSent(e.loaded);
		xhr.onerror = () => resolve({ status: 0, body: null });
		xhr.onload = () => {
			let parsed: Sent['body'] = null;
			try {
				parsed = JSON.parse(xhr.responseText) as Sent['body'];
			} catch {
				// not JSON: handled by the status
			}
			resolve({ status: xhr.status, body: parsed });
		};
		xhr.send(body);
	});
}

/** How much of an upload the router holds: the .part file and the finished file. */
export async function uploadStatus(
	client: RpcClient,
	name: UploadName,
): Promise<{ part: number; stored: number | null }> {
	let res: Response;
	try {
		res = await fetch(`${transferUrl(client.endpoint, name)}&status`, {
			headers: { 'X-Nuci-Session': client.sid },
			cache: 'no-store',
		});
	} catch {
		throw failure(0, name);
	}
	if (!res.ok) throw failure(res.status, name);
	return (await res.json()) as { part: number; stored: number | null };
}

/**
 * Upload in chunks at increasing offsets; after a failed request it asks the
 * router how much arrived and goes on from there. Resolves to the stored size.
 */
export async function upload(
	client: RpcClient,
	name: UploadName,
	blob: Blob,
	onProgress?: (sent: number, total: number) => void,
): Promise<number> {
	const total = blob.size;
	const base = transferUrl(client.endpoint, name);
	let offset = 0;
	let chunk = FIRST_CHUNK;
	let failures = 0;
	onProgress?.(0, total);
	for (;;) {
		const end = Math.min(total, offset + chunk);
		const from = offset;
		const t0 = performance.now();
		const r = await send(
			client,
			`${base}&offset=${from}&total=${total}`,
			blob.slice(from, end),
			(sent) => onProgress?.(Math.min(total, from + sent), total),
		);
		const size = r.body?.size;
		if (r.status === 200 && typeof size === 'number') {
			if (r.body?.complete) {
				onProgress?.(total, total);
				return size;
			}
			offset = size;
			failures = 0;
			chunk = nextChunk(size - from, performance.now() - t0, chunk);
			continue;
		}
		if ([403, 404, 411, 413].includes(r.status)) throw failure(r.status, name);
		if (++failures > MAX_RETRIES) throw failure(r.status, name);
		if (r.status === 409 && typeof size === 'number' && size <= total) {
			offset = size; // the router's .part ends elsewhere: continue there
			continue;
		}
		// Cut connection, killed handler or a short body: what arrived stays.
		chunk = Math.max(MIN_CHUNK, Math.floor(chunk / 4));
		await sleep(backoff(failures));
		if (offset === 0) continue; // nothing acknowledged yet: start over
		const st = await uploadStatus(client, name).catch(() => null);
		if (!st) continue;
		if (st.part === 0 && st.stored === total) {
			// The last chunk arrived, only its reply was lost.
			onProgress?.(total, total);
			return total;
		}
		offset = st.part;
	}
}
