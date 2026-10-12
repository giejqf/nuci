// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import DataTable from './DataTable.svelte';

const rows = [
	{ pid: 10, name: 'dnsmasq' },
	{ pid: 2, name: 'kthreadd' },
	{ pid: 100, name: 'uhttpd' },
];

describe('DataTable', () => {
	it('sorts numerically via keyboard-accessible headers and filters', async () => {
		render(DataTable, {
			columns: [
				{ key: 'pid', label: 'PID', sortable: true },
				{ key: 'name', label: 'Name', sortable: true },
			],
			rows,
			rowKey: (r: Record<string, unknown>) => r.pid as number,
			filter: true,
		});
		const firstCol = () =>
			screen
				.getAllByRole('row')
				.slice(1)
				.map((r) => r.firstElementChild?.textContent);
		expect(firstCol()).toEqual(['10', '2', '100']);
		await fireEvent.click(screen.getByRole('button', { name: /PID/ }));
		expect(firstCol()).toEqual(['2', '10', '100']);
		expect(screen.getAllByRole('columnheader')[0]?.getAttribute('aria-sort')).toBe('ascending');
		await fireEvent.click(screen.getByRole('button', { name: /PID/ }));
		expect(firstCol()).toEqual(['100', '10', '2']);
		await fireEvent.input(screen.getByLabelText('Filter'), { target: { value: 'dns' } });
		expect(firstCol()).toEqual(['10']);
		await fireEvent.input(screen.getByLabelText('Filter'), { target: { value: 'zzz' } });
		expect(screen.getByText('No entries')).toBeTruthy();
	});
});
