<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Sortable, filterable table. Columns render `row[key]` unless a `cell`
	snippet is given; sort headers are buttons (keyboard accessible).
-->
<script lang="ts" generics="Row extends object">
	import type { Snippet } from 'svelte';
	import { ArrowDown, ArrowUp, ArrowUpDown } from '@lucide/svelte';
	import { t } from '@nuci/i18n';

	interface Column {
		key: string;
		label: string;
		sortable?: boolean;
		align?: 'left' | 'right';
		/** Value used for sorting/filtering when it differs from row[key]. */
		value?: (row: Row) => string | number;
		class?: string;
	}

	interface Props {
		columns: Column[];
		rows: Row[];
		rowKey: (row: Row) => string | number;
		cell?: Snippet<[Row, Column]>;
		filter?: boolean;
		empty?: string;
		caption?: string;
		sortKey?: string;
		sortDir?: 'asc' | 'desc';
		testid?: string;
		class?: string;
	}
	let {
		columns,
		rows,
		rowKey,
		cell,
		filter = false,
		empty,
		caption,
		sortKey = $bindable(),
		sortDir = $bindable('asc'),
		testid,
		class: klass = '',
	}: Props = $props();

	let query = $state('');

	const valueOf = (row: Row, c: Column): string | number => {
		if (c.value) return c.value(row);
		const v = (row as Record<string, unknown>)[c.key];
		return typeof v === 'number' ? v : v == null ? '' : String(v);
	};

	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		let out = q
			? rows.filter((r) =>
					columns.some((c) => String(valueOf(r, c)).toLowerCase().includes(q)),
				)
			: rows;
		const col = columns.find((c) => c.key === sortKey);
		if (col) {
			const dir = sortDir === 'desc' ? -1 : 1;
			out = [...out].sort((a, b) => {
				const x = valueOf(a, col);
				const y = valueOf(b, col);
				if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
				return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
			});
		}
		return out;
	});

	function sortBy(key: string) {
		if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortKey = key;
			sortDir = 'asc';
		}
	}
</script>

<div class="flex flex-col gap-2 {klass}" data-testid={testid}>
	{#if filter}
		<input
			type="search"
			class="input input-sm w-full max-w-xs"
			placeholder={t('ui.table.filter')}
			aria-label={t('ui.table.filter')}
			bind:value={query}
		/>
	{/if}
	<div class="overflow-x-auto">
		<table class="table-zebra table-sm table">
			{#if caption}<caption class="sr-only">{caption}</caption>{/if}
			<thead>
				<tr>
					{#each columns as c (c.key)}
						<th
							class="{c.align === 'right' ? 'text-right' : ''} {c.class ?? ''}"
							aria-sort={sortKey === c.key
								? sortDir === 'asc'
									? 'ascending'
									: 'descending'
								: undefined}
						>
							{#if c.sortable}
								<button
									type="button"
									class="inline-flex items-center gap-1"
									onclick={() => sortBy(c.key)}
								>
									{c.label}
									{#if sortKey !== c.key}
										<ArrowUpDown
											size={14}
											class="opacity-40"
											aria-hidden="true"
										/>
									{:else if sortDir === 'asc'}
										<ArrowUp size={14} aria-hidden="true" />
									{:else}
										<ArrowDown size={14} aria-hidden="true" />
									{/if}
								</button>
							{:else}
								{c.label}
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each visible as row (rowKey(row))}
					<tr>
						{#each columns as c (c.key)}
							<td
								class="{c.align === 'right'
									? 'text-right tabular-nums'
									: ''} {c.class ?? ''}"
							>
								{#if cell}{@render cell(row, c)}{:else}{valueOf(row, c)}{/if}
							</td>
						{/each}
					</tr>
				{:else}
					<tr>
						<td colspan={columns.length} class="text-base-content/60 py-6 text-center">
							{empty ?? t('ui.table.empty')}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
