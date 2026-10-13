// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { UciModel, UciStore } from '@nuci/uci';
import { FakeRpcdUci } from '../../uci/src/test/fake-rpcd';
import SectionListHost from './test/SectionListHost.svelte';

let store: UciStore;

beforeEach(async () => {
	store = new UciStore(
		new UciModel(
			new FakeRpcdUci({
				dhcp: {
					h1: {
						'.anonymous': true,
						'.type': 'host',
						'.name': 'h1',
						'.index': 0,
						name: 'nas',
						mac: 'aa:bb:cc:dd:ee:ff',
						ip: '192.168.1.20',
					},
				},
			}),
		),
	);
	await store.load('dhcp');
});

describe('SectionList', () => {
	it('lists, adds, cancels and deletes sections (staged)', async () => {
		render(SectionListHost, { props: { store } });
		expect(screen.getByText('nas')).toBeTruthy();

		await fireEvent.click(screen.getByTestId('hosts-add'));
		// An open add dialog stages nothing yet.
		expect(store.changes).toEqual([]);
		expect(store.totalChanges).toBe(0);
		// Done on an incomplete form shows what is missing and stays open.
		await fireEvent.click(screen.getByTestId('hosts-done'));
		expect(screen.getByRole('alert').textContent).toBeTruthy();
		expect(store.changes).toEqual([]);
		await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'printer' } });
		await fireEvent.click(screen.getByTestId('hosts-done'));
		await waitFor(() => expect(screen.getByText('printer')).toBeTruthy());
		expect(store.sections('dhcp', 'host')).toHaveLength(2);

		await fireEvent.click(screen.getByTestId('hosts-add'));
		await fireEvent.click(screen.getByText('Cancel'));
		expect(store.sections('dhcp', 'host')).toHaveLength(2);
		expect(store.changes.map((c) => c.kind)).toEqual(['add']);

		await fireEvent.click(screen.getByLabelText('Delete nas'));
		expect(store.sections('dhcp', 'host').map((s) => s.name)).toEqual(['printer']);
		expect(store.changes.map((c) => c.kind)).toEqual(['remove', 'add']);
	});
});
