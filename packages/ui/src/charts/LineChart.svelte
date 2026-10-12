<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Realtime line chart (dataviz method): 2px lines, hairline grid, one y-axis,
	end markers with a surface ring, crosshair + tooltip on hover/keyboard,
	legend with current values for 2+ series, and a table view.
	Series colors follow `slot` (1-4), so filtering never repaints survivors.
-->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { uid } from '../form.svelte';
	import { compact, niceTicks } from './scale';
	import type { Series } from './types';

	interface Props {
		title: string;
		/** Sample times (ms since epoch), aligned with every series' values. */
		times: number[];
		series: Series[];
		/** Visible time window in ms (default: 3 minutes). */
		windowMs?: number;
		format?: (v: number) => string;
		tickFormat?: (v: number) => string;
		yMin?: number;
		/** Lower bound for the y-axis maximum (e.g. 100 for percentages). */
		yMaxAtLeast?: number;
		height?: number;
		area?: boolean;
		testid?: string;
	}
	let {
		title,
		times,
		series,
		windowMs = 180_000,
		format = (v: number) => compact(v),
		tickFormat = compact,
		yMin = 0,
		yMaxAtLeast = 0,
		height = 180,
		area = false,
		testid,
	}: Props = $props();

	const id = uid('chart');
	const M = { top: 8, right: 12, bottom: 22, left: 48 };
	let width = $state(600);
	let active = $state<number | null>(null);

	const plotW = $derived(Math.max(10, width - M.left - M.right));
	const plotH = $derived(height - M.top - M.bottom);
	const tEnd = $derived(times.at(-1) ?? Date.now());
	const tStart = $derived(tEnd - windowMs);
	const visibleFrom = $derived(
		Math.max(
			0,
			times.findIndex((x) => x >= tStart),
		),
	);
	const yMaxData = $derived(
		Math.max(
			yMaxAtLeast,
			...series.flatMap((s) =>
				s.values.slice(visibleFrom).filter((v): v is number => v !== null),
			),
		),
	);
	const ticks = $derived(niceTicks(yMin, yMaxData > yMin ? yMaxData : yMin + 1));
	const yMax = $derived(ticks.at(-1)!);

	const x = (tm: number) => M.left + ((tm - tStart) / windowMs) * plotW;
	const y = (v: number) => M.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

	function path(values: (number | null)[]): string {
		let d = '';
		let pen = false;
		for (let i = visibleFrom; i < values.length; i++) {
			const v = values[i];
			if (v === null || v === undefined || times[i] === undefined) {
				pen = false;
				continue;
			}
			d += `${pen ? 'L' : 'M'}${x(times[i]!).toFixed(1)},${y(v).toFixed(1)}`;
			pen = true;
		}
		return d;
	}

	function areaPath(values: (number | null)[]): string {
		const line = path(values);
		if (!line) return '';
		const pts = values
			.map((v, i) => [i, v] as const)
			.filter(([i, v]) => i >= visibleFrom && v !== null);
		const first = pts[0]?.[0] ?? 0;
		const last = pts.at(-1)?.[0] ?? 0;
		return `${line}L${x(times[last]!).toFixed(1)},${y(yMin)}L${x(times[first]!).toFixed(1)},${y(yMin)}Z`;
	}

	const lastIndex = $derived(times.length - 1);
	const shown = $derived(active ?? lastIndex);
	const timeLabel = (tm: number) =>
		new Date(tm).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
	const xTicks = $derived([tStart, tStart + windowMs / 2, tEnd]);

	function nearest(clientX: number, rect: DOMRect): number | null {
		if (!times.length) return null;
		const tm = tStart + ((clientX - rect.left - M.left) / plotW) * windowMs;
		let best = visibleFrom;
		for (let i = visibleFrom; i < times.length; i++)
			if (Math.abs(times[i]! - tm) < Math.abs(times[best]! - tm)) best = i;
		return best;
	}

	function key(e: KeyboardEvent) {
		if (!times.length) return;
		const cur = active ?? lastIndex;
		if (e.key === 'ArrowLeft') active = Math.max(visibleFrom, cur - 1);
		else if (e.key === 'ArrowRight') active = Math.min(lastIndex, cur + 1);
		else if (e.key === 'Escape') active = null;
		else return;
		e.preventDefault();
	}

	const summary = $derived(
		`${title}: ` +
			series
				.map(
					(s) =>
						`${s.label} ${s.values[lastIndex] == null ? '—' : format(s.values[lastIndex]!)}`,
				)
				.join(', '),
	);
	const tooltipLeft = $derived(active === null ? 0 : x(times[active]!));
</script>

<figure class="flex flex-col gap-2" data-testid={testid}>
	{#if series.length >= 2}
		<ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={t('chart.legend')}>
			{#each series as s (s.id)}
				<li class="flex items-center gap-2">
					<svg width="16" height="8" aria-hidden="true"
						><line
							x1="0"
							y1="4"
							x2="16"
							y2="4"
							stroke="var(--viz-{s.slot})"
							stroke-width="2"
							stroke-linecap="round"
						/></svg
					>
					<span class="text-base-content/70">{s.label}</span>
					<span class="font-medium tabular-nums" data-testid="{testid}-value-{s.id}">
						{s.values[shown] == null ? '—' : format(s.values[shown]!)}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="relative" bind:clientWidth={width}>
		<!-- Focusable image: arrow keys move the crosshair; the table view carries the same values. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<svg
			{width}
			{height}
			role="img"
			aria-label={summary}
			aria-describedby="{id}-hint"
			tabindex="0"
			class="block touch-none outline-offset-2"
			onpointermove={(e) =>
				(active = nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
			onpointerleave={() => (active = null)}
			onkeydown={key}
			onblur={() => (active = null)}
		>
			{#each ticks as tk (tk)}
				<line
					x1={M.left}
					x2={M.left + plotW}
					y1={y(tk)}
					y2={y(tk)}
					stroke={tk === yMin ? 'var(--viz-axis)' : 'var(--viz-grid)'}
					stroke-width="1"
				/>
				<text
					x={M.left - 6}
					y={y(tk)}
					dy="0.32em"
					text-anchor="end"
					class="tabular-nums"
					font-size="11"
					fill="var(--viz-muted)">{tickFormat(tk)}</text
				>
			{/each}
			{#each xTicks as tk, i (i)}
				<text
					x={x(tk)}
					y={height - 6}
					text-anchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
					font-size="11"
					fill="var(--viz-muted)">{timeLabel(tk)}</text
				>
			{/each}
			{#each series as s (s.id)}
				{#if area}<path
						d={areaPath(s.values)}
						fill="var(--viz-{s.slot})"
						fill-opacity="0.1"
						stroke="none"
					/>{/if}
				<path
					d={path(s.values)}
					fill="none"
					stroke="var(--viz-{s.slot})"
					stroke-width="2"
					stroke-linejoin="round"
					stroke-linecap="round"
				/>
			{/each}
			{#if active !== null}
				<line
					x1={tooltipLeft}
					x2={tooltipLeft}
					y1={M.top}
					y2={M.top + plotH}
					stroke="var(--viz-axis)"
					stroke-width="1"
				/>
			{/if}
			{#each series as s (s.id)}
				{@const v = s.values[shown]}
				{#if v != null && times[shown] !== undefined}
					<circle
						cx={x(times[shown]!)}
						cy={y(v)}
						r="4"
						fill="var(--viz-{s.slot})"
						stroke="var(--color-base-100)"
						stroke-width="2"
					/>
				{/if}
			{/each}
		</svg>
		{#if active !== null && times[active] !== undefined}
			<div
				class="bg-base-100 border-base-300 pointer-events-none absolute top-1 z-10 rounded-box border px-3 py-2 text-xs shadow-md"
				style="{tooltipLeft > width / 2 ? 'right' : 'left'}: {tooltipLeft > width / 2
					? width - tooltipLeft + 8
					: tooltipLeft + 8}px"
				role="status"
				data-testid="{testid}-tooltip"
			>
				<div class="text-base-content/60 mb-1">{timeLabel(times[active]!)}</div>
				{#each series as s (s.id)}
					<div class="flex items-center gap-2">
						<svg width="12" height="6" aria-hidden="true"
							><line
								x1="0"
								y1="3"
								x2="12"
								y2="3"
								stroke="var(--viz-{s.slot})"
								stroke-width="2"
							/></svg
						>
						<span class="font-semibold tabular-nums"
							>{s.values[active] == null ? '—' : format(s.values[active]!)}</span
						>
						<span class="text-base-content/60">{s.label}</span>
					</div>
				{/each}
			</div>
		{/if}
		<span id="{id}-hint" class="sr-only">{t('chart.hint')}</span>
	</div>
	<details class="text-sm">
		<summary class="text-base-content/60 cursor-pointer">{t('chart.table')}</summary>
		<div class="max-h-60 overflow-auto">
			<table class="table-xs table">
				<caption class="sr-only">{title}</caption>
				<thead>
					<tr>
						<th>{t('chart.time')}</th>
						{#each series as s (s.id)}<th class="text-right">{s.label}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each times
						.slice(visibleFrom)
						.map((tm, i) => [tm, i + visibleFrom] as const)
						.reverse() as [tm, i] (tm)}
						<tr>
							<td class="tabular-nums">{timeLabel(tm)}</td>
							{#each series as s (s.id)}
								<td class="text-right tabular-nums"
									>{s.values[i] == null ? '—' : format(s.values[i]!)}</td
								>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</figure>
