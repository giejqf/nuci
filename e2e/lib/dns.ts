// SPDX-License-Identifier: Apache-2.0
// Name lookups on the lab router itself (nuci.diag nslookup, answered by dnsmasq).

import { expect } from '@playwright/test';
import type { createRpc } from '../../packages/rpc/src/index.ts';
import { slow } from './timing';

/** nslookup on the router; the finished job's output. */
export async function lookup(rpc: ReturnType<typeof createRpc>, host: string): Promise<string> {
	await rpc.nuci.diag.nslookup(host);
	await expect
		.poll(async () => (await rpc.nuci.diag.status()).running, { timeout: slow(60_000) })
		.toBe(false);
	return (await rpc.nuci.diag.status()).log ?? '';
}
