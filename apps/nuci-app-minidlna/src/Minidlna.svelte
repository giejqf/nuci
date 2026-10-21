<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Services → Media server: minidlna's settings and media folders (staged in
	the host; an apply restarts it), the library counts and connected
	players from its status page, and a full rescan (nuci.minidlna, a job).
-->
<script lang="ts">
	import { Plus, RefreshCw, Trash2 } from '@lucide/svelte';
	import type { HostContext } from '@nuci/app-sdk';
	import { t } from '@nuci/i18n';
	import {
		getNuciContext,
		poll,
		Section,
		Select,
		Stat,
		TextField,
		Toggle,
		toasts,
		validators,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { minidlnaApi, type Status } from './api';

	let { host }: { host: HostContext } = $props();
	const uci = getNuciContext().uci;
	const api = $derived(minidlnaApi(host));
	const S = 'config';

	let st = $state<Status | null>(null);
	let busy = $state(false);
	const canWrite = $derived(host.hasAccess('nuci-app-minidlna', 'write'));
	const loaded = $derived(uci.isLoaded('minidlna') && !!uci.getSection('minidlna', S));
	const num = $derived(new Intl.NumberFormat(host.locale));

	// media_dir entries: "/path" (everything) or "A,/path" (audio), "V," (video), "P," (pictures).
	type Kind = '' | 'A' | 'V' | 'P';
	const dirs = $derived.by(() => {
		const v = loaded ? uci.get('minidlna', S, 'media_dir') : undefined;
		const list = Array.isArray(v) ? v : v ? [String(v)] : [];
		return list.map((e) => {
			const m = /^([AVP]{1,3}),(.*)$/.exec(e);
			return { kind: (m ? m[1]!.slice(0, 1) : '') as Kind, path: m ? m[2]! : e };
		});
	});
	const kinds = $derived([
		{ value: '', label: t('dlna.kind.all') },
		{ value: 'A', label: t('dlna.kind.audio') },
		{ value: 'V', label: t('dlna.kind.video') },
		{ value: 'P', label: t('dlna.kind.pictures') },
	]);
	function setDirs(list: { kind: Kind; path: string }[]) {
		uci.set(
			'minidlna',
			S,
			'media_dir',
			list.length ? list.map((d) => (d.kind ? `${d.kind},${d.path}` : d.path)) : null,
		);
	}
	const absPath = (v: string) => (v === '' || /^\/\S*$/.test(v) ? null : 'dlna.path_invalid');
	const ifaceList = (v: string) =>
		v === '' || /^[A-Za-z0-9_.@-]+(,[A-Za-z0-9_.@-]+)*$/.test(v) ? null : 'dlna.iface_invalid';

	async function refresh() {
		try {
			st = await api.status();
		} catch {
			// best effort: the configuration stays usable
		}
	}

	onMount(() => {
		void host.uci.load('minidlna');
		return poll(refresh, 5000);
	});

	async function rescan() {
		busy = true;
		try {
			await api.rescan();
			toasts.success(t('dlna.rescan_started'));
			await refresh();
		} catch (e) {
			toasts.error(String((e as Error)?.message ?? e));
		} finally {
			busy = false;
		}
	}
</script>

<Section title={t('dlna.status')} description={t('dlna.help')}>
	{#if st}
		<div class="flex flex-wrap items-center gap-2">
			<span
				class="badge {st.running ? 'badge-success' : 'badge-ghost'}"
				data-testid="dlna-running"
				>{st.running ? t('dlna.running') : t('dlna.stopped')}</span
			>
			{#if st.library?.version}<span class="badge badge-ghost"
					>MiniDLNA {st.library.version}</span
				>{/if}
		</div>
		{#if st.library}
			<div
				class="stats stats-vertical sm:stats-horizontal bg-base-200"
				data-testid="dlna-library"
			>
				<Stat label={t('dlna.audio')} value={num.format(st.library.audio ?? 0)} />
				<Stat label={t('dlna.video')} value={num.format(st.library.video ?? 0)} />
				<Stat
					label={t('dlna.pictures')}
					value={num.format(st.library.image ?? 0)}
					testid="dlna-pictures"
				/>
			</div>
			<h3 class="text-sm font-semibold">{t('dlna.clients')}</h3>
			{#if st.library.clients.length}
				<!-- Scrollable region: focusable so keyboard users can scroll it. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class="overflow-x-auto"
					role="region"
					tabindex="0"
					aria-label={t('ui.table.region')}
				>
					<table class="table-sm nuci-stack table" data-testid="dlna-clients">
						<thead>
							<tr>
								<th>{t('dlna.client_type')}</th>
								<th>{t('dlna.client_ip')}</th>
								<th>{t('dlna.client_mac')}</th>
								<th>{t('dlna.client_conns')}</th>
							</tr>
						</thead>
						<tbody>
							{#each st.library.clients as c (c.mac + c.ip)}
								<tr>
									<td data-label={t('dlna.client_type')}>{c.type}</td>
									<td class="font-mono text-xs" data-label={t('dlna.client_ip')}
										>{c.ip}</td
									>
									<td class="font-mono text-xs" data-label={t('dlna.client_mac')}
										>{c.mac}</td
									>
									<td data-label={t('dlna.client_conns')}>{c.connections}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="text-base-content/70 text-sm">{t('dlna.no_clients')}</p>
			{/if}
		{/if}
		{#if canWrite && st.running}
			<div>
				<button
					type="button"
					class="btn btn-sm"
					disabled={busy || st.job.running}
					onclick={rescan}
					data-testid="dlna-rescan"
					><RefreshCw size={16} aria-hidden="true" />{t('dlna.rescan')}</button
				>
			</div>
		{/if}
	{:else}
		<span class="loading loading-spinner" role="status" aria-label={t('dlna.loading')}></span>
	{/if}
</Section>

{#if loaded}
	<Section title={t('dlna.settings')}>
		<Toggle label={t('dlna.enabled')} uci="minidlna.{S}.enabled" testid="dlna-enabled" />
		<TextField
			label={t('dlna.name')}
			uci="minidlna.{S}.friendly_name"
			description={t('dlna.name_help')}
			testid="dlna-name"
		/>
		<TextField
			label={t('dlna.interface')}
			uci="minidlna.{S}.interface"
			validate={ifaceList}
			placeholder="br-lan"
			description={t('dlna.interface_help')}
		/>
		<TextField
			label={t('dlna.port')}
			uci="minidlna.{S}.port"
			validate={validators.port}
			placeholder="8200"
		/>
		<Toggle
			label={t('dlna.inotify')}
			uci="minidlna.{S}.inotify"
			default={true}
			description={t('dlna.inotify_help')}
		/>
		<Select
			label={t('dlna.root')}
			uci="minidlna.{S}.root_container"
			options={[
				{ value: '.', label: t('dlna.root.standard') },
				{ value: 'B', label: t('dlna.root.folders') },
				{ value: 'M', label: t('dlna.root.music') },
				{ value: 'V', label: t('dlna.root.video') },
				{ value: 'P', label: t('dlna.root.pictures') },
			]}
			placeholder={t('dlna.root.standard')}
		/>
		<Toggle
			label={t('dlna.strict')}
			uci="minidlna.{S}.strict_dlna"
			description={t('dlna.strict_help')}
		/>
		<Toggle label={t('dlna.tivo')} uci="minidlna.{S}.enable_tivo" />
	</Section>

	<Section title={t('dlna.folders')} description={t('dlna.folders_help')}>
		<div class="flex flex-col gap-2" data-testid="dlna-folders">
			{#each dirs as d, i (i)}
				<div class="flex flex-wrap items-end gap-2">
					<div class="w-40">
						<Select
							label={t('dlna.kind')}
							options={kinds}
							value={d.kind}
							readonly={!canWrite}
							onchange={(v) =>
								setDirs(
									dirs.map((x, j) => (j === i ? { ...x, kind: v as Kind } : x)),
								)}
							testid="dlna-folder-kind"
						/>
					</div>
					<div class="min-w-48 flex-1">
						<TextField
							label={t('dlna.path')}
							bind:value={
								() => d.path,
								(v) =>
									setDirs(dirs.map((x, j) => (j === i ? { ...x, path: v } : x)))
							}
							validate={validators.all(validators.required, absPath)}
							testid="dlna-folder-path"
						/>
					</div>
					{#if canWrite}
						<button
							type="button"
							class="btn btn-ghost btn-sm mb-2"
							aria-label={t('dlna.remove_folder', { path: d.path })}
							onclick={() => setDirs(dirs.filter((_, j) => j !== i))}
							><Trash2 size={16} aria-hidden="true" /></button
						>
					{/if}
				</div>
			{:else}
				<p class="text-base-content/70 text-sm">{t('dlna.no_folders')}</p>
			{/each}
			{#if canWrite}
				<div>
					<button
						type="button"
						class="btn btn-sm"
						onclick={() => setDirs([...dirs, { kind: '', path: '/mnt' }])}
						data-testid="dlna-folder-add"
						><Plus size={16} aria-hidden="true" />{t('dlna.add_folder')}</button
					>
				</div>
			{/if}
		</div>
	</Section>
{/if}
