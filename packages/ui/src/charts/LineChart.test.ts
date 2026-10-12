// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import LineChart from './LineChart.svelte';
import { compact, niceTicks } from './scale';

describe('scale helpers', () => {
	it('produces clean ticks covering the max', () => {
		expect(niceTicks(0, 87)).toEqual([0, 25, 50, 75, 100]);
		expect(niceTicks(0, 0.3)).toEqual([0, 0.1, 0.2, 0.3]);
		expect(niceTicks(0, 0)).toEqual([0, 0.25, 0.5, 0.75, 1]);
	});
	it('formats compact numbers', () => {
		expect(compact(950)).toBe('950');
		expect(compact(1200)).toBe('1.2K');
		expect(compact(3_400_000)).toBe('3.4M');
		expect(compact(0.25)).toBe('0.25');
	});
});

describe('LineChart', () => {
	const t0 = 1_700_000_000_000;
	const props = {
		title: 'Load',
		testid: 'c',
		times: [t0, t0 + 2000, t0 + 4000],
		series: [
			{ id: 'l1', label: '1 min', slot: 1 as const, values: [0.1, 0.5, 0.3] },
			{ id: 'l5', label: '5 min', slot: 2 as const, values: [0.2, null, 0.25] },
		],
		format: (v: number) => v.toFixed(2),
	};

	it('labels the latest values in the legend and the accessible summary', () => {
		render(LineChart, props);
		expect(screen.getByTestId('c-value-l1').textContent?.trim()).toBe('0.30');
		expect(screen.getByTestId('c-value-l5').textContent?.trim()).toBe('0.25');
		expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
			'Load: 1 min 0.30, 5 min 0.25',
		);
	});

	it('moves a crosshair with the keyboard and shows every series in the tooltip', async () => {
		render(LineChart, props);
		const svg = screen.getByRole('img');
		await fireEvent.keyDown(svg, { key: 'ArrowLeft' });
		const tip = screen.getByTestId('c-tooltip');
		expect(tip.textContent).toContain('0.50');
		expect(tip.textContent).toContain('—');
		expect(screen.getByTestId('c-value-l1').textContent?.trim()).toBe('0.50');
		await fireEvent.keyDown(svg, { key: 'Escape' });
		expect(screen.queryByTestId('c-tooltip')).toBeNull();
	});

	it('has a table view with every sample', () => {
		render(LineChart, props);
		const rows = screen.getAllByRole('row');
		expect(rows).toHaveLength(4); // header + 3 samples
	});

	it('omits the legend box for a single series', () => {
		render(LineChart, { ...props, series: [props.series[0]!] });
		expect(screen.queryByLabelText('Legend')).toBeNull();
	});
});
