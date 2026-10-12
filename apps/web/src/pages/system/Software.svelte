<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- System → Software: apk packages via nuci.pkg; installs run as background jobs. -->
<script lang="ts">
	import { Download, RefreshCw, Search, Trash2 } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import {
		isRpcError,
		type InstalledPackages,
		type JobStatus,
		type PackageInfo,
	} from '@nuci/rpc';
	import { DataTable, formatBytes, Modal, Page, Section, Tabs, toasts } from '@nuci/ui';
	import { onMount } from 'svelte';
	import { rpc } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	let tab = $state('installed');
	let installed = $state<InstalledPackages>({ packages: [], upgradable: [] });
	let loading = $state(true);
	let query = $state('');
	let results = $state<PackageInfo[] | null>(null);
	let searching = $state(false);
	let job = $state<JobStatus | null>(null);
	let confirm = $state<{ action: 'add' | 'del' | 'upgrade'; packages: string[] } | null>(null);
	let confirmOpen = $state(false);
	let error = $state('');

	const canWrite = $derived(session.acl.canCall('nuci.pkg', 'add'));
	const installedNames = $derived(new Set(installed.packages.map((p) => p.name)));
	const busy = $derived(job?.running ?? false);

	async function loadInstalled() {
		try {
			installed = await rpc.nuci.pkg.listInstalled();
			error = '';
		} catch (e) {
			error = isRpcError(e) ? t(e.messageKey) : String(e);
		} finally {
			loading = false;
		}
	}

	async function pollJob() {
		job = await rpc.nuci.pkg.jobStatus();
		while (job.running) {
			await new Promise((r) => setTimeout(r, 1000));
			job = await rpc.nuci.pkg.jobStatus();
		}
	}

	async function runJob(start: () => Promise<JobStatus>, done: string) {
		try {
			job = await start();
			await pollJob();
			if (job.rc === 0) toasts.success(done);
			else toasts.error(t('software.job_failed', { rc: job.rc ?? '?' }));
			await loadInstalled();
			if (results && query) await search();
		} catch (e) {
			toasts.error(isRpcError(e) ? t(e.messageKey) : String(e));
		}
	}

	async function search(e?: Event) {
		e?.preventDefault();
		if (query.trim().length < 2) return;
		searching = true;
		try {
			results = await rpc.nuci.pkg.search(query.trim());
		} catch (err) {
			toasts.error(isRpcError(err) ? t(err.messageKey) : String(err));
		} finally {
			searching = false;
		}
	}

	function ask(action: 'add' | 'del' | 'upgrade', packages: string[]) {
		confirm = { action, packages };
		confirmOpen = true;
	}

	function go() {
		if (!confirm) return;
		const { action, packages } = confirm;
		confirmOpen = false;
		const list = packages.join(', ');
		if (action === 'del')
			void runJob(
				() => rpc.nuci.pkg.del(packages),
				t('software.removed', { packages: list }),
			);
		else
			void runJob(
				() => rpc.nuci.pkg.add(packages, action === 'upgrade'),
				t('software.installed_ok', { packages: list }),
			);
	}

	onMount(() => {
		void loadInstalled();
		void pollJob().catch(() => {});
	});

	const tabs = $derived([
		{
			id: 'installed',
			label: t('software.tab.installed', { count: installed.packages.length }),
		},
		{ id: 'available', label: t('software.tab.available') },
		{ id: 'updates', label: t('software.tab.updates', { count: installed.upgradable.length }) },
	]);
</script>

<Page title={t('software.title')} description={t('software.description')}>
	{#snippet actions()}
		{#if canWrite}
			<button
				type="button"
				class="btn btn-sm"
				disabled={busy}
				onclick={() => runJob(() => rpc.nuci.pkg.update(), t('software.lists_updated'))}
				data-testid="pkg-update"
			>
				<RefreshCw size={16} aria-hidden="true" />{t('software.update_lists')}
			</button>
		{/if}
	{/snippet}

	{#if job && (job.running || job.log)}
		<Section
			title={job.running ? t('software.job_running') : t('software.job_last')}
			testid="pkg-job"
		>
			<p class="text-sm" aria-live="polite">
				<span class="font-mono">{job.command}</span>
				{#if job.running}<span
						class="loading loading-dots loading-xs ml-2"
						aria-hidden="true"
					></span>
				{:else}<span
						class="badge badge-sm {job.rc === 0 ? 'badge-success' : 'badge-error'} ml-2"
						>{job.rc === 0
							? t('software.ok')
							: t('software.failed', { rc: job.rc ?? '?' })}</span
					>{/if}
			</p>
			<pre
				class="bg-base-200 rounded-box max-h-48 overflow-auto p-2 text-xs"
				data-testid="pkg-job-log">{job.log}</pre>
		</Section>
	{/if}

	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}

	<Tabs {tabs} bind:active={tab}>
		{#snippet children(active)}
			{#if active === 'installed'}
				{#if loading}
					<div class="flex justify-center p-8" role="status">
						<span
							class="loading loading-spinner"
							role="img"
							aria-label={t('ui.loading')}
						></span>
					</div>
				{:else}
					<DataTable
						testid="pkg-installed"
						rows={installed.packages}
						rowKey={(p) => p.name}
						filter
						sortKey="name"
						columns={[
							{ key: 'name', label: t('software.col.name'), sortable: true },
							{ key: 'version', label: t('software.col.version') },
							{
								key: 'installed_size',
								label: t('software.col.size'),
								align: 'right',
								sortable: true,
							},
							{ key: 'description', label: t('software.col.description') },
							...(canWrite
								? [{ key: 'actions', label: '', align: 'right' as const }]
								: []),
						]}
					>
						{#snippet cell(p, col)}
							{#if col.key === 'installed_size'}{formatBytes(p.installed_size)}
							{:else if col.key === 'description'}<span class="line-clamp-2 text-xs"
									>{p.description ?? ''}</span
								>
							{:else if col.key === 'actions'}
								<button
									type="button"
									class="btn btn-ghost btn-xs"
									disabled={busy}
									aria-label={t('software.remove_pkg', { name: p.name })}
									onclick={() => ask('del', [p.name])}
								>
									<Trash2 size={14} aria-hidden="true" />
								</button>
							{:else}<span
									class={col.key === 'name' ? 'font-medium' : 'font-mono text-xs'}
									>{p[col.key as 'name' | 'version']}</span
								>{/if}
						{/snippet}
					</DataTable>
				{/if}
			{:else if active === 'available'}
				<form class="mb-4 flex gap-2" onsubmit={search} role="search">
					<input
						class="input input-sm w-72"
						type="search"
						placeholder={t('software.search_placeholder')}
						aria-label={t('software.search')}
						bind:value={query}
						data-testid="pkg-search"
					/>
					<button
						class="btn btn-sm"
						type="submit"
						disabled={query.trim().length < 2 || searching}
					>
						{#if searching}<span
								class="loading loading-spinner loading-xs"
								aria-hidden="true"
							></span>{:else}<Search size={16} aria-hidden="true" />{/if}{t(
							'software.search',
						)}
					</button>
				</form>
				{#if results}
					<DataTable
						testid="pkg-results"
						rows={results}
						rowKey={(p) => p.name}
						empty={t('software.no_results')}
						columns={[
							{ key: 'name', label: t('software.col.name'), sortable: true },
							{ key: 'version', label: t('software.col.version') },
							{ key: 'description', label: t('software.col.description') },
							...(canWrite
								? [{ key: 'actions', label: '', align: 'right' as const }]
								: []),
						]}
					>
						{#snippet cell(p, col)}
							{#if col.key === 'description'}<span class="line-clamp-2 text-xs"
									>{p.description ?? ''}</span
								>
							{:else if col.key === 'actions'}
								{#if installedNames.has(p.name)}
									<span class="badge badge-ghost badge-sm"
										>{t('software.is_installed')}</span
									>
								{:else}
									<button
										type="button"
										class="btn btn-primary btn-xs"
										disabled={busy}
										aria-label={t('software.install_pkg', { name: p.name })}
										onclick={() => ask('add', [p.name])}
									>
										<Download size={14} aria-hidden="true" />{t(
											'software.install',
										)}
									</button>
								{/if}
							{:else}<span
									class={col.key === 'name' ? 'font-medium' : 'font-mono text-xs'}
									>{p[col.key as 'name' | 'version']}</span
								>{/if}
						{/snippet}
					</DataTable>
				{:else}
					<p class="text-base-content/60 text-sm">{t('software.search_hint')}</p>
				{/if}
			{:else}
				{#if installed.upgradable.length}
					{#if canWrite}
						<button
							type="button"
							class="btn btn-primary btn-sm mb-3"
							disabled={busy}
							onclick={() => ask('upgrade', installed.upgradable)}
							>{t('software.upgrade_all')}</button
						>
					{/if}
					<ul class="flex flex-col gap-1 text-sm" data-testid="pkg-updates">
						{#each installed.upgradable as name (name)}<li class="font-mono">
								{name}
							</li>{/each}
					</ul>
				{:else}
					<p class="text-base-content/60 text-sm">{t('software.no_updates')}</p>
				{/if}
			{/if}
		{/snippet}
	</Tabs>
</Page>

<Modal bind:open={confirmOpen} title={t('software.confirm_title')} testid="pkg-confirm">
	{#if confirm}
		<p>{t(`software.confirm_${confirm.action}`, { packages: confirm.packages.join(', ') })}</p>
	{/if}
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (confirmOpen = false)}
			>{t('ui.cancel')}</button
		>
		<button
			type="button"
			class="btn {confirm?.action === 'del' ? 'btn-error' : 'btn-primary'}"
			onclick={go}
			data-testid="pkg-confirm-go">{t('software.proceed')}</button
		>
	{/snippet}
</Modal>
