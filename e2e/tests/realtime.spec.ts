// SPDX-License-Identifier: Apache-2.0
// Phase 0 exit: log in through the real /ubus from the browser and receive
// at least one SSE event from /nuci/events.

import { expect, test } from '@playwright/test';
import { NULL_SID, rootPassword } from '../lib/router';

test('browser logs in via /ubus and receives an SSE event', async ({ page }) => {
	await page.goto('/nuci/');

	const sid = await page.evaluate(
		async ({ password, nullSid }) => {
			const res = await fetch('/ubus', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'call',
					params: [nullSid, 'session', 'login', { username: 'root', password }],
				}),
			});
			const json = await res.json();
			return json.result?.[1]?.ubus_rpc_session as string | undefined;
		},
		{ password: rootPassword(), nullSid: NULL_SID },
	);
	expect(sid).toMatch(/^[0-9a-f]{32}$/);

	const event = await page.evaluate(
		(sid) =>
			new Promise<{ type: string; id: string; data: unknown }>((resolve, reject) => {
				const es = new EventSource(`/nuci/events?sid=${sid}&streams=heartbeat`);
				const timer = setTimeout(() => {
					es.close();
					reject(new Error('no SSE event within 10s'));
				}, 10_000);
				es.addEventListener('heartbeat', (e) => {
					clearTimeout(timer);
					es.close();
					resolve({ type: e.type, id: e.lastEventId, data: JSON.parse(e.data) });
				});
			}),
		sid,
	);
	expect(event.type).toBe('heartbeat');
	expect(Number(event.id)).toBeGreaterThan(0);
	expect(event.data).toHaveProperty('t');
});

test('/nuci/events rejects missing, null and unknown sessions', async ({ request }) => {
	for (const sid of ['', NULL_SID, '0123456789abcdef0123456789abcdef']) {
		const res = await request.get(`/nuci/events?sid=${sid}`);
		expect(res.status(), `sid=${sid}`).toBe(403);
	}
});
