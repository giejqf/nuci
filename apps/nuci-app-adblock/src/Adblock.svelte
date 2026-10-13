<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Services → Adblock: DNS blocklists with adblock. Settings and feeds are
	uci (staged in the host, adblock reloads after the apply); the local
	allow- and blocklists are files saved directly, followed by a reload.
-->
<script lang="ts">
	import type { HostContext } from '@nuci/app-sdk';
	import { t } from '@nuci/i18n';
	import { Pause, Play, RefreshCw, Search } from '@lucide/svelte';
	import {
		DynamicList,
		getNuciContext,
		ListField,
		poll,
		Section,
		Select,
		Stat,
		Toggle,
		toasts,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { adblockApi, validDomain, type AdblockStatus, type Feed, type ListName } from './api';

	let { host }: { host: HostContext } = $props();
	const uci = getNuciContext().uci;
	const api = $derived(adblockApi(host));
	const G = 'adblock.global';

	let st = $state<AdblockStatus | null>(null);
	let feeds = $state<Feed[]>([]);
	let customFeeds = $state(false);
	let text = $state<Record<ListName, string>>({ allow: '', block: '' });
	let saved = $state<Record<ListName, string>>({ allow: '', block: '' });
	let saving = $state<ListName | null>(null);
	let lookup = $state('');
	let busy = $state(false);
	let error = $state('');

	const canWrite = $derived(host.hasAccess('nuci-app-adblock', 'write'));
	const running = $derived(st?.job.running || st?.state === 'processing');
	const selectedFeeds = $derived(
		uci.isLoaded('adblock') ? toList(uci.get('adblock', 'global', 'adb_feed')) : [],
	);
	const categoryFeeds = $derived(
		feeds.filter((f) => f.option && f.categories && selectedFeeds.includes(f.name)),
	);

	function toList(v: unknown): string[] {
		return Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? v.split(/\s+/) : [];
	}
	const parse = (s: string) =>
		s
			.split('\n')
			.map((l) => l.trim().toLowerCase())
			.filter((l) => l && !l.startsWith('#'));
	const invalid = (l: ListName) => parse(text[l]).filter((d) => !validDomain(d));
	const dirty = (l: ListName) => parse(text[l]).join('\n') !== parse(saved[l]).join('\n');

	const stateClass = (s: string | null) =>
		s === 'enabled'
			? 'badge-success'
			: s === 'error'
				? 'badge-error'
				: s === 'processing' || s === 'paused'
					? 'badge-warning'
					: 'badge-ghost';

	async function refresh() {
		try {
			st = await api.status();
			error = '';
		} catch (e) {
			error = String((e as Error)?.message ?? e);
		}
	}

	async function loadLists() {
		const l = await api.lists();
		saved = { allow: l.allow.join('\n'), block: l.block.join('\n') };
		text = { ...saved };
	}

	async function act(fn: () => Promise<unknown>) {
		busy = true;
		error = '';
		try {
			await fn();
		} catch (e) {
			error = String((e as Error)?.message ?? e);
		} finally {
			busy = false;
		}
		await refresh();
	}

	const runAction = (action: 'reload' | 'suspend' | 'resume') =>
		act(async () => {
			await api.run(action);
			toasts.success(t(`adblock.started_${action}`));
		});

	const saveList = (l: ListName) =>
		act(async () => {
			saving = l;
			try {
				const r = await api.setList(l, parse(text[l]));
				await loadLists();
				toasts.success(r.job ? t('adblock.list_saved') : t('adblock.list_saved_busy'));
			} finally {
				saving = null;
			}
		});

	const search = () => act(() => api.search(lookup.trim().toLowerCase()));

	onMount(() => {
		void host.uci.load('adblock');
		void api
			.feeds()
			.then((f) => {
				feeds = f.feeds;
				customFeeds = f.custom;
			})
			.catch(() => {});
		void loadLists().catch(() => {});
		return poll(refresh, 3000);
	});
</script>

{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}

<Section title={t('adblock.title')} description={t('adblock.help')} testid="adblock-status">
	{#snippet actions()}
		{#if st}
			<span class="badge {stateClass(st.state)}" data-testid="adblock-state"
				>{st.state ? t(`adblock.state.${st.state}`) : t('adblock.state.none')}</span
			>
		{/if}
	{/snippet}
	{#if uci.isLoaded('adblock')}
		<Toggle
			label={t('adblock.enabled')}
			uci="{G}.adb_enabled"
			default={false}
			testid="adblock-enabled"
		/>
	{/if}
	<dl class="max-w-md">
		<Stat
			label={t('adblock.blocked')}
			value={st?.blocked != null ? st.blocked.toLocaleString(host.locale) : null}
			testid="adblock-blocked"
		/>
		<Stat
			label={t('adblock.active_feeds')}
			value={st?.feeds.length ? st.feeds.join(', ') : null}
		/>
		<Stat
			label={t('adblock.last_run')}
			value={st?.last_run
				? t('adblock.last_run_value', {
						time: st.last_run.time,
						seconds: st.last_run.duration,
					})
				: null}
		/>
		<Stat label={t('adblock.backend')} value={st?.backend ?? null} />
	</dl>
	{#if canWrite}
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class="btn btn-sm"
				disabled={busy || running}
				onclick={() => runAction('reload')}
				data-testid="adblock-reload"
				><RefreshCw size={16} aria-hidden="true" />{t('adblock.reload')}</button
			>
			{#if st?.state === 'paused'}
				<button
					type="button"
					class="btn btn-sm"
					disabled={busy || running}
					onclick={() => runAction('resume')}
					data-testid="adblock-resume"
					><Play size={16} aria-hidden="true" />{t('adblock.resume')}</button
				>
			{:else if st?.state === 'enabled'}
				<button
					type="button"
					class="btn btn-sm"
					disabled={busy || running}
					onclick={() => runAction('suspend')}
					data-testid="adblock-suspend"
					><Pause size={16} aria-hidden="true" />{t('adblock.suspend')}</button
				>
			{/if}
		</div>
	{/if}
	{#if st && !st.job.running && st.job.rc != null && st.job.rc !== 0}
		<div role="alert" class="alert alert-warning text-sm">{t('adblock.busy')}</div>
	{/if}
</Section>

{#if uci.isLoaded('adblock')}
	<Section
		title={t('adblock.feeds')}
		description={customFeeds ? t('adblock.feeds_custom') : t('adblock.feeds_help')}
	>
		{#if feeds.length}
			<ListField
				label={t('adblock.feeds_label')}
				uci="{G}.adb_feed"
				options={feeds.map((f) => ({
					value: f.name,
					label: t('adblock.feed_label', {
						name: f.name,
						descr: f.descr,
						size: f.size,
					}),
				}))}
				testid="adblock-feeds"
			/>
		{/if}
		{#each categoryFeeds as f (f.name)}
			<ListField
				label={t('adblock.categories', { feed: f.name })}
				uci="{G}.{f.option}"
				options={f.categories ?? []}
				description={t('adblock.categories_help')}
			/>
		{/each}
	</Section>

	<Section title={t('adblock.settings')}>
		<Select
			label={t('adblock.dns')}
			uci="{G}.adb_dns"
			options={['dnsmasq', 'unbound', 'named', 'kresd', 'smartdns'].map((v) => ({
				value: v,
				label: v,
			}))}
			description={t('adblock.dns_help')}
		/>
		<Toggle
			label={t('adblock.safesearch')}
			uci="{G}.adb_safesearch"
			default={false}
			description={t('adblock.safesearch_help')}
		/>
		<Toggle
			label={t('adblock.force')}
			uci="{G}.adb_nftforce"
			default={false}
			description={t('adblock.force_help')}
		/>
		<DynamicList
			label={t('adblock.trigger')}
			uci="{G}.adb_trigger"
			description={t('adblock.trigger_help')}
			validate={(v) => (/^[A-Za-z0-9_.-]+$/.test(v) ? null : 'adblock.trigger_invalid')}
		/>
	</Section>
{/if}

{#each ['block', 'allow'] as const as l (l)}
	<Section title={t(`adblock.list_${l}`)} description={t(`adblock.list_${l}_help`)}>
		<label class="fieldset">
			<span class="fieldset-legend">{t('adblock.domains')}</span>
			<textarea
				class="textarea h-36 w-full font-mono text-sm"
				bind:value={text[l]}
				readonly={!canWrite}
				spellcheck="false"
				autocapitalize="off"
				placeholder="ads.example.com"
				data-testid="adblock-list-{l}"></textarea>
		</label>
		{#if invalid(l).length}
			<p class="text-error text-sm" role="alert">
				{t('adblock.invalid_domains', { domains: invalid(l).slice(0, 5).join(', ') })}
			</p>
		{/if}
		{#if canWrite}
			<div>
				<button
					type="button"
					class="btn btn-sm btn-primary"
					disabled={busy || !dirty(l) || invalid(l).length > 0}
					onclick={() => saveList(l)}
					data-testid="adblock-save-{l}"
					>{saving === l ? t('adblock.saving') : t('adblock.save_list')}</button
				>
			</div>
		{/if}
	</Section>
{/each}

{#if canWrite}
	<Section title={t('adblock.lookup')} description={t('adblock.lookup_help')}>
		<form
			class="flex flex-wrap items-end gap-2"
			onsubmit={(e) => {
				e.preventDefault();
				void search();
			}}
		>
			<label class="fieldset">
				<span class="fieldset-legend">{t('adblock.domain')}</span>
				<input
					class="input input-sm w-64"
					bind:value={lookup}
					spellcheck="false"
					autocapitalize="off"
					data-testid="adblock-lookup"
				/>
			</label>
			<button
				type="submit"
				class="btn btn-sm"
				disabled={busy || st?.search.running || !validDomain(lookup.trim().toLowerCase())}
				data-testid="adblock-lookup-go"
				><Search size={16} aria-hidden="true" />{t('adblock.lookup_go')}</button
			>
		</form>
		{#if st?.search.command}
			{#if st.search.running}<span class="loading loading-dots loading-sm" aria-hidden="true"
				></span>{/if}
			<!-- Scrollable region: focusable so keyboard users can scroll it. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<pre
				class="bg-base-200 max-h-64 overflow-auto rounded p-2 text-xs whitespace-pre-wrap"
				tabindex="0"
				aria-label={t('adblock.lookup')}
				data-testid="adblock-lookup-result">{st.search.log ?? ''}</pre>
		{/if}
	</Section>
{/if}
