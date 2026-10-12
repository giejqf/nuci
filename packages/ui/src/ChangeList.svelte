<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Review of local edits and saved-but-unapplied session changes. -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import type { Change } from '@nuci/uci';

	interface Props {
		changes: Change[];
		pending: Record<string, [string, ...string[]][]>;
	}
	let { changes, pending }: Props = $props();

	const fmt = (v: string | string[] | undefined) =>
		Array.isArray(v) ? v.map((x) => `'${x}'`).join(' ') : `'${v ?? ''}'`;

	function describe(c: Change): string {
		switch (c.kind) {
			case 'set':
				return `${c.config}.${c.section}.${c.option} = ${fmt(c.to)}`;
			case 'unset':
				return `${c.config}.${c.section}.${c.option}`;
			case 'add':
				return `${c.config}.${c.section} (${c.type})`;
			case 'remove':
				return `${c.config}.${c.section}`;
			case 'order':
				return `${c.config}: ${c.sections.join(', ')}`;
		}
	}

	const pendingRows = $derived(
		Object.entries(pending).flatMap(([config, list]) =>
			list.map(([op, section, option, value]) => ({
				op,
				text: `${config}.${section}${option ? `.${option}` : ''}${value !== undefined ? ` = '${value}'` : ''}`,
			})),
		),
	);
	const badge: Record<string, string> = {
		set: 'badge-info',
		add: 'badge-success',
		remove: 'badge-error',
		unset: 'badge-warning',
		order: 'badge-neutral',
		rename: 'badge-neutral',
		'list-add': 'badge-success',
		'list-del': 'badge-warning',
	};
</script>

<div class="flex flex-col gap-4 text-sm" data-testid="change-list">
	{#if changes.length}
		<div>
			<h4 class="mb-1 font-semibold">{t('ui.changes.local')}</h4>
			<ul class="flex flex-col gap-1 font-mono">
				{#each changes as c, i (i)}
					<li class="flex items-center gap-2">
						<span class="badge badge-sm {badge[c.kind]}"
							>{t(`ui.changes.kind.${c.kind}`)}</span
						>
						<span class="break-all">{describe(c)}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
	{#if pendingRows.length}
		<div>
			<h4 class="mb-1 font-semibold">{t('ui.changes.saved')}</h4>
			<ul class="flex flex-col gap-1 font-mono">
				{#each pendingRows as r, i (i)}
					<li class="flex items-center gap-2">
						<span class="badge badge-sm {badge[r.op] ?? 'badge-neutral'}">{r.op}</span>
						<span class="break-all">{r.text}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
	{#if !changes.length && !pendingRows.length}
		<p class="text-base-content/60">{t('ui.changes.none')}</p>
	{/if}
</div>
