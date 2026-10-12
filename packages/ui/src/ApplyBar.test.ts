// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { UciModel, UciStore } from '@nuci/uci';
import { FakeRpcdUci, fixtureConfigs } from '../../uci/src/test/fake-rpcd';
import ApplyBar from './ApplyBar.svelte';
import Host from './test/Host.svelte';

const host = (props: Record<string, unknown>) => render(Host, { props: props as never });
import Toaster from './Toaster.svelte';

let rpcd: FakeRpcdUci;
let store: UciStore;

beforeEach(async () => {
	rpcd = new FakeRpcdUci(fixtureConfigs());
	store = new UciStore(new UciModel(rpcd));
	await store.load('system');
});

describe('ApplyBar', () => {
	it('is hidden without changes', () => {
		host({ ctx: { uci: store, apply: { probe: async () => true } }, component: ApplyBar });
		expect(screen.queryByTestId('apply-bar')).toBeNull();
	});

	it('saves into the session, then applies and confirms', async () => {
		render(Toaster);
		host({
			ctx: { uci: store, apply: { probe: async () => true, holdoffMs: 0 } },
			component: ApplyBar,
		});
		store.set('system', '@system[0]', 'hostname', 'router');
		await waitFor(() =>
			expect(screen.getByTestId('apply-review').textContent).toContain('1 unsaved'),
		);

		await fireEvent.click(screen.getByTestId('apply-save'));
		await waitFor(() => expect(store.pendingCount).toBe(1));
		expect(rpcd.committed.system?.cfg01e48a?.hostname).toBe('OpenWrt');

		await fireEvent.click(screen.getByTestId('apply-apply'));
		await waitFor(() => expect(screen.getByText('Configuration applied.')).toBeTruthy());
		expect(rpcd.committed.system?.cfg01e48a?.hostname).toBe('router');
		expect(rpcd.log).toContainEqual(['confirm']);
		await waitFor(() => expect(screen.queryByTestId('apply-bar')).toBeNull());
	});

	it('reverts local and saved changes', async () => {
		host({ ctx: { uci: store, apply: { probe: async () => true } }, component: ApplyBar });
		store.set('system', '@system[0]', 'hostname', 'a');
		await store.save();
		store.set('system', 'ntp', 'enabled', '0');
		await waitFor(() =>
			expect(screen.getByTestId('apply-review').textContent).toContain('2 unsaved'),
		);
		await fireEvent.click(screen.getByTestId('apply-revert'));
		await waitFor(() => expect(store.totalChanges).toBe(0));
		expect(store.get('system', '@system[0]', 'hostname')).toBe('OpenWrt');
	});
});
