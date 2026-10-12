<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Generic log viewer: text filter, minimum severity, follow (auto-scroll),
	download. Severity uses syslog levels 0 (emerg) .. 7 (debug) and is
	always shown as a label, never as color alone.
-->
<script lang="ts">
	import { Download } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { tick } from 'svelte';
	import type { LogLine } from './types';

	interface Props {
		lines: LogLine[];
		follow?: boolean;
		filename?: string;
		testid?: string;
	}
	let { lines, follow = $bindable(true), filename = 'log.txt', testid }: Props = $props();

	const LEVELS = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'] as const;
	let query = $state('');
	let minLevel = $state(7);
	let box: HTMLDivElement | undefined = $state();

	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return lines.filter(
			(l) =>
				l.level <= minLevel &&
				(!q ||
					l.msg.toLowerCase().includes(q) ||
					(l.source ?? '').toLowerCase().includes(q)),
		);
	});

	$effect(() => {
		void visible.length;
		if (follow && box) void tick().then(() => box && (box.scrollTop = box.scrollHeight));
	});

	function badge(level: number): string {
		if (level <= 3) return 'badge-error';
		if (level === 4) return 'badge-warning';
		if (level === 5) return 'badge-info';
		return 'badge-ghost';
	}

	function download() {
		const text = visible
			.map(
				(l) =>
					`${l.time} ${LEVELS[l.level] ?? l.level}${l.source ? ` ${l.source}` : ''}: ${l.msg}`,
			)
			.join('\n');
		const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="flex flex-col gap-3" data-testid={testid}>
	<div class="flex flex-wrap items-end gap-3">
		<input
			type="search"
			class="input input-sm w-64"
			placeholder={t('log.filter')}
			aria-label={t('log.filter')}
			bind:value={query}
		/>
		<label class="flex items-center gap-2 text-sm">
			<span>{t('log.level')}</span>
			<select
				class="select select-sm w-36"
				bind:value={minLevel}
				data-testid="{testid}-level"
			>
				{#each LEVELS as name, i (name)}
					<option value={i}>{t(`log.levels.${name}`)}</option>
				{/each}
			</select>
		</label>
		<label class="label cursor-pointer gap-2 text-sm">
			<input
				type="checkbox"
				class="toggle toggle-sm"
				bind:checked={follow}
				data-testid="{testid}-follow"
			/>
			<span class="text-base-content">{t('log.follow')}</span>
		</label>
		<button type="button" class="btn btn-ghost btn-sm" onclick={download}>
			<Download size={16} aria-hidden="true" />{t('log.download')}
		</button>
		<span class="text-base-content/60 ml-auto text-sm" data-testid="{testid}-count"
			>{t('log.count', { shown: visible.length, total: lines.length })}</span
		>
	</div>
	<!-- Scrollable region: focusable so keyboard users can scroll it. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		bind:this={box}
		class="bg-base-200 rounded-box max-h-[65vh] min-h-48 overflow-auto p-2 font-mono text-xs leading-relaxed"
		role="log"
		aria-live="off"
		aria-label={t('log.title')}
		tabindex="0"
	>
		{#each visible as l (l.key)}
			<div class="flex gap-2 py-0.5" data-testid="{testid}-line">
				<span class="text-base-content/60 shrink-0 tabular-nums">{l.time}</span>
				<span class="badge badge-xs {badge(l.level)} mt-0.5 w-14 shrink-0"
					>{LEVELS[l.level] ?? l.level}</span
				>
				{#if l.source}<span class="text-base-content/70 shrink-0">{l.source}</span>{/if}
				<span class="min-w-0 break-words whitespace-pre-wrap">{l.msg}</span>
			</div>
		{:else}
			<p class="text-base-content/60 p-4 text-center font-sans">{t('log.empty')}</p>
		{/each}
	</div>
</div>
