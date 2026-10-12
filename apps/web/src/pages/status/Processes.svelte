<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Status → Processes: refreshed every 3 s while visible; signals via nuci.status. -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { isRpcError, SIGNALS, type ProcessInfo } from '@nuci/rpc';
	import { DataTable, formatBytes, formatPercent, Modal, Page, Section, toasts } from '@nuci/ui';
	import { onMount } from 'svelte';
	import { rpc } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	type Row = ProcessInfo & { cpu: number | null };

	let rows = $state<Row[]>([]);
	let error = $state('');
	let loaded = $state(false);
	let sortKey = $state<string | undefined>('cpu');
	let sortDir = $state<'asc' | 'desc'>('desc');
	let pending = $state<{ row: Row; signal: keyof typeof SIGNALS } | null>(null);
	let confirming = $state(false);
	let prev: { ticks: Map<number, number>; total: number } | null = null;

	const canSignal = $derived(session.acl.canCall('nuci.status', 'signal'));

	async function load() {
		try {
			const { processes, total_ticks } = await rpc.nuci.status.processes();
			const dt = prev ? total_ticks - prev.total : 0;
			rows = processes.map((p) => {
				const before = prev?.ticks.get(p.pid);
				return {
					...p,
					cpu:
						prev && dt > 0 && before !== undefined
							? Math.max(0, (p.cpu_ticks - before) / dt)
							: null,
				};
			});
			prev = {
				ticks: new Map(processes.map((p) => [p.pid, p.cpu_ticks])),
				total: total_ticks,
			};
			error = '';
		} catch (e) {
			error = isRpcError(e) ? t(e.messageKey) : String(e);
		} finally {
			loaded = true;
		}
	}

	onMount(() => {
		let timer: ReturnType<typeof setTimeout>;
		let gone = false;
		// One request at a time: the next refresh is scheduled after this one ends.
		const loop = async () => {
			if (document.visibilityState === 'visible') await load();
			if (!gone) timer = setTimeout(loop, 3000);
		};
		void loop();
		return () => {
			gone = true;
			clearTimeout(timer);
		};
	});

	function ask(row: Row, signal: keyof typeof SIGNALS) {
		pending = { row, signal };
		confirming = true;
	}

	async function send() {
		if (!pending) return;
		const { row, signal } = pending;
		confirming = false;
		try {
			await rpc.nuci.status.signal(row.pid, SIGNALS[signal]);
			toasts.success(t('processes.sent', { signal, pid: row.pid }));
			await load();
		} catch (e) {
			toasts.error(isRpcError(e) ? t(e.messageKey) : String(e));
		}
		pending = null;
	}

	const columns = $derived([
		{ key: 'pid', label: t('processes.col.pid'), sortable: true, align: 'right' as const },
		{ key: 'user', label: t('processes.col.user'), sortable: true },
		{ key: 'state', label: t('processes.col.state') },
		{
			key: 'cpu',
			label: t('processes.col.cpu'),
			sortable: true,
			align: 'right' as const,
			value: (r: Row) => r.cpu ?? -1,
		},
		{ key: 'rss', label: t('processes.col.memory'), sortable: true, align: 'right' as const },
		{ key: 'command', label: t('processes.col.command'), sortable: true },
		...(canSignal
			? [{ key: 'actions', label: t('processes.col.actions'), align: 'right' as const }]
			: []),
	]);
</script>

<Page title={t('processes.title')} description={t('processes.description')}>
	<Section>
		{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
		{#if !loaded}
			<div class="flex justify-center p-8" role="status">
				<span class="loading loading-spinner" aria-label={t('ui.loading')}></span>
			</div>
		{:else}
			<DataTable
				testid="processes"
				caption={t('processes.title')}
				{rows}
				rowKey={(r) => r.pid}
				filter
				bind:sortKey
				bind:sortDir
				{columns}
			>
				{#snippet cell(row, col)}
					{#if col.key === 'cpu'}
						{row.cpu === null ? '—' : formatPercent(row.cpu, 1)}
					{:else if col.key === 'rss'}
						{formatBytes(row.rss * 1024)}
					{:else if col.key === 'command'}
						<span class="font-mono text-xs break-all">{row.command}</span>
					{:else if col.key === 'actions'}
						{#if row.pid > 1 && !row.command.startsWith('[')}
							<div class="join">
								<button
									type="button"
									class="btn btn-xs join-item"
									onclick={() => ask(row, 'HUP')}
									aria-label={t('processes.hup_pid', { pid: row.pid })}
									>HUP</button
								>
								<button
									type="button"
									class="btn btn-xs join-item"
									onclick={() => ask(row, 'TERM')}
									aria-label={t('processes.term_pid', { pid: row.pid })}
									>TERM</button
								>
								<button
									type="button"
									class="btn btn-xs btn-error btn-outline join-item"
									onclick={() => ask(row, 'KILL')}
									aria-label={t('processes.kill_pid', { pid: row.pid })}
									>KILL</button
								>
							</div>
						{/if}
					{:else}
						{row[col.key as 'pid' | 'user' | 'state']}
					{/if}
				{/snippet}
			</DataTable>
		{/if}
	</Section>
</Page>

<Modal bind:open={confirming} title={t('processes.confirm_title')} testid="signal-confirm">
	{#if pending}
		<p>{t('processes.confirm', { signal: pending.signal, pid: pending.row.pid })}</p>
		<p class="mt-2 font-mono text-xs break-all">{pending.row.command}</p>
	{/if}
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (confirming = false)}
			>{t('ui.cancel')}</button
		>
		<button type="button" class="btn btn-error" onclick={send} data-testid="signal-send"
			>{t('processes.send')}</button
		>
	{/snippet}
</Modal>
