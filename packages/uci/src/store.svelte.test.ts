// SPDX-License-Identifier: Apache-2.0
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { UciModel } from './model';
import { UciStore } from './store.svelte';
import { FakeRpcdUci, fixtureConfigs } from './test/fake-rpcd';

describe('UciStore', () => {
	it('re-runs effects when the model changes', async () => {
		const store = new UciStore(new UciModel(new FakeRpcdUci(fixtureConfigs())));
		const seen: (string | string[] | undefined)[] = [];
		const counts: number[] = [];
		const cleanup = $effect.root(() => {
			$effect(() => {
				seen.push(store.get('system', '@system[0]', 'hostname'));
				counts.push(store.totalChanges);
			});
		});
		flushSync();
		await store.load('system');
		flushSync();
		store.set('system', '@system[0]', 'hostname', 'router');
		flushSync();
		expect(seen).toEqual([undefined, 'OpenWrt', 'router']);
		expect(counts.at(-1)).toBe(1);
		cleanup();
	});
});
