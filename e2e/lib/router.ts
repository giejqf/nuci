// SPDX-License-Identifier: Apache-2.0
// Helpers for talking to the lab router directly (outside the SPA).

import type { APIRequestContext } from '@playwright/test';

export const NULL_SID = '00000000000000000000000000000000';

export function rootPassword(): string {
	const pw = process.env.NUCI_ROOT_PASSWORD;
	if (!pw) throw new Error('NUCI_ROOT_PASSWORD is not set (run via `pnpm e2e`)');
	return pw;
}

export interface UbusReply<T = unknown> {
	jsonrpc: '2.0';
	id: number;
	result?: [number, T?];
	error?: { code: number; message: string };
}

export async function ubus<T = unknown>(
	request: APIRequestContext,
	sid: string,
	object: string,
	method: string,
	args: Record<string, unknown> = {},
): Promise<UbusReply<T>> {
	const res = await request.post('/ubus', {
		data: { jsonrpc: '2.0', id: 1, method: 'call', params: [sid, object, method, args] },
	});
	return (await res.json()) as UbusReply<T>;
}
