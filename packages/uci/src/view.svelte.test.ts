// SPDX-License-Identifier: Apache-2.0
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { UciModel } from './model';
import { FakeRpcdUci, fixtureConfigs } from './test/fake-rpcd';
import { HostUciStore, type HostUciLike } from './view.svelte';

/** What the host shell exposes as HostContext.uci (apps/web/src/apps/host.svelte.ts). */
function hostUci(m: UciModel): HostUciLike & { listeners: number } {
	const listeners = new Set<() => void>();
	m.subscribe(() => listeners.forEach((l) => l()));
	return {
		get listeners() {
			return listeners.size;
		},
		load: (...c) => m.load(...c),
		isLoaded: (c) => m.isLoaded(c),
		get: (c, s, o) => m.get(c, s, o),
		getBase: (c, s, o) => m.getBase(c, s, o),
		getSection: (c, s) => m.getSection(c, s),
		sections: (c, type) => m.sections(c, type),
		resolve: (ref) => m.resolve(ref),
		set: (c, s, o, v) => m.set(c, s, o, v),
		add: (c, type, name, values) => m.add(c, type, name, values),
		remove: (c, s) => m.remove(c, s),
		order: (c, s) => m.order(c, s),
		canWrite: (c) => c !== 'network',
		busy: false,
		subscribe: (l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
	};
}

describe('HostUciStore', () => {
	it('is reactive over host notifications and stages edits in the host model', async () => {
		const model = new UciModel(new FakeRpcdUci(fixtureConfigs()));
		const host = hostUci(model);
		const store = new HostUciStore(host);
		const seen: (string | string[] | undefined)[] = [];
		const cleanup = $effect.root(() => {
			$effect(() => {
				seen.push(store.get('system', '@system[0]', 'hostname'));
			});
		});
		flushSync();
		await store.load('system');
		flushSync();
		store.set('system', '@system[0]', 'hostname', 'app-edit');
		flushSync();
		expect(seen).toEqual([undefined, 'OpenWrt', 'app-edit']);
		// The edit lives in the host's model: it is what the host's ApplyBar applies.
		expect(model.changes()).toHaveLength(1);
		expect(store.getBase('system', '@system[0]', 'hostname')).toBe('OpenWrt');
		expect(store.canWrite('system')).toBe(true);
		expect(store.canWrite('network')).toBe(false);
		cleanup();
		store.dispose();
		expect(host.listeners).toBe(0);
	});
});
