<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- System → Startup: init scripts (rc) and /etc/rc.local. -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { isRpcError, type InitScript } from '@nuci/rpc';
	import { DataTable, Page, Section, toasts } from '@nuci/ui';
	import { onMount } from 'svelte';
	import { rpc } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	type Action = 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable';
	type Row = InitScript & { name: string };

	let scripts = $state<Row[]>([]);
	let loading = $state(true);
	let busy = $state<string | null>(null);
	let rcLocal = $state('');
	let rcLoaded = $state(false);
	let rcBusy = $state(false);
	let error = $state('');

	const canInit = $derived(session.acl.canCall('rc', 'init'));

	async function load() {
		try {
			const list = await rpc.rc.list();
			scripts = Object.entries(list)
				.map(([name, s]) => ({ ...s, name }))
				.sort((a, b) => (a.start ?? 99) - (b.start ?? 99) || a.name.localeCompare(b.name));
			error = '';
		} catch (e) {
			error = isRpcError(e) ? t(e.messageKey) : String(e);
		} finally {
			loading = false;
		}
	}

	async function act(name: string, action: Action) {
		busy = `${name}:${action}`;
		try {
			await rpc.rc.init(name, action);
			toasts.success(t('startup.done', { name, action: t(`startup.action.${action}`) }));
		} catch (e) {
			toasts.error(isRpcError(e) ? t(e.messageKey) : String(e));
		} finally {
			busy = null;
			await load();
		}
	}

	async function saveRcLocal() {
		rcBusy = true;
		try {
			const text = rcLocal.endsWith('\n') ? rcLocal : `${rcLocal}\n`;
			await rpc.file.write('/etc/rc.local', text, { mode: 0o755 });
			toasts.success(t('startup.rclocal_saved'));
		} catch (e) {
			toasts.error(isRpcError(e) ? t(e.messageKey) : String(e));
		} finally {
			rcBusy = false;
		}
	}

	onMount(() => {
		void load();
		rpc.file
			.read('/etc/rc.local')
			.then((s) => (rcLocal = s))
			.catch(() => (rcLocal = ''))
			.finally(() => (rcLoaded = true));
	});
</script>

<Page title={t('startup.title')} description={t('startup.description')} readonly={!canInit}>
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	<Section title={t('startup.scripts')}>
		{#if loading}
			<div class="flex justify-center p-8" role="status">
				<span class="loading loading-spinner" role="img" aria-label={t('ui.loading')}
				></span>
			</div>
		{:else}
			<DataTable
				testid="init-scripts"
				rows={scripts}
				rowKey={(r) => r.name}
				filter
				columns={[
					{
						key: 'start',
						label: t('startup.col.priority'),
						align: 'right',
						sortable: true,
						value: (r) => r.start ?? 999,
					},
					{ key: 'name', label: t('startup.col.name'), sortable: true },
					{ key: 'enabled', label: t('startup.col.boot') },
					{ key: 'running', label: t('startup.col.status') },
					...(canInit
						? [
								{
									key: 'actions',
									label: t('startup.col.actions'),
									align: 'right' as const,
								},
							]
						: []),
				]}
			>
				{#snippet cell(r, col)}
					{#if col.key === 'start'}{r.start ?? '—'}
					{:else if col.key === 'enabled'}
						<span class="badge badge-sm {r.enabled ? 'badge-success' : 'badge-ghost'}"
							>{r.enabled ? t('startup.enabled') : t('startup.disabled')}</span
						>
					{:else if col.key === 'running'}
						{#if r.running === undefined}—{:else}<span
								class="badge badge-sm {r.running ? 'badge-info' : 'badge-ghost'}"
								>{r.running ? t('startup.running') : t('startup.stopped')}</span
							>{/if}
					{:else if col.key === 'actions'}
						<div
							class="join"
							role="group"
							aria-label={t('startup.actions_for', { name: r.name })}
						>
							{#each (r.enabled ? ['disable', 'start', 'restart', 'stop'] : ['enable', 'start', 'restart', 'stop']) as Action[] as a (a)}
								<button
									type="button"
									class="btn btn-xs join-item"
									disabled={busy !== null}
									onclick={() => act(r.name, a)}
									data-testid="init-{r.name}-{a}"
								>
									{#if busy === `${r.name}:${a}`}<span
											class="loading loading-spinner loading-xs"
											aria-hidden="true"
										></span>{/if}
									{t(`startup.action.${a}`)}
								</button>
							{/each}
						</div>
					{:else}<span class="font-medium">{r.name}</span>{/if}
				{/snippet}
			</DataTable>
		{/if}
	</Section>

	<Section title={t('startup.rclocal')} description={t('startup.rclocal_help')}>
		{#if rcLoaded}
			<textarea
				class="textarea h-48 w-full font-mono text-xs"
				bind:value={rcLocal}
				spellcheck="false"
				aria-label={t('startup.rclocal')}
				readonly={!canInit}
				data-testid="rc-local"></textarea>
			{#if canInit}
				<div>
					<button
						type="button"
						class="btn btn-sm"
						disabled={rcBusy}
						onclick={saveRcLocal}
						data-testid="rc-local-save">{t('startup.rclocal_save')}</button
					>
				</div>
			{/if}
		{/if}
	</Section>
</Page>
