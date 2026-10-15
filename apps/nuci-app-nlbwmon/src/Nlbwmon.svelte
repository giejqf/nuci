<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Status → Traffic usage: nlbwmon's accounting per client and protocol for
	the current or an archived period, and its settings (uci nlbwmon, staged
	in the host).
-->
<script lang="ts">
	import type { HostContext } from '@nuci/app-sdk';
	import { t } from '@nuci/i18n';
	import {
		DataTable,
		DynamicList,
		formatBytes,
		formatPercent,
		getNuciContext,
		poll,
		Section,
		Select,
		Stat,
		Tabs,
		TextField,
		Toggle,
		validators,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { nlbwmonApi, type Client, type Counters, type Traffic } from './api';

	let { host }: { host: HostContext } = $props();
	const uci = getNuciContext().uci;
	const api = $derived(nlbwmonApi(host));
	const S = 'nlbwmon.@nlbwmon[0]';

	let periods = $state<string[]>([]);
	let period = $state('');
	let traffic = $state<Traffic | null>(null);
	let error = $state('');
	let selected = $state<string | null>(null);
	let tab = $state('clients');

	const total = $derived(
		(traffic?.clients ?? []).reduce(
			(s, c) => ({
				rx: s.rx + c.rx_bytes,
				tx: s.tx + c.tx_bytes,
				conns: s.conns + c.conns,
			}),
			{ rx: 0, tx: 0, conns: 0 },
		),
	);
	const client = $derived(traffic?.clients.find((c) => c.mac === selected) ?? null);
	const volume = (c: Counters) => c.rx_bytes + c.tx_bytes;
	const share = (c: Counters) => (total.rx + total.tx ? volume(c) / (total.rx + total.tx) : 0);
	const duration = (v: string) =>
		!v || /^[0-9]+[smhd]?$/.test(v) ? null : 'nlbw.duration_invalid';
	const name = (c: Client) => c.hostname || c.ips[0] || c.mac;

	const dateFmt = $derived(new Intl.DateTimeFormat(host.locale, { dateStyle: 'medium' }));
	const formatPeriod = (p: string) => dateFmt.format(new Date(`${p}T00:00:00`));

	async function refresh() {
		try {
			const [list, data] = await Promise.all([api.periods(), api.data(period || undefined)]);
			periods = list.periods;
			traffic = data;
			error = '';
		} catch (e) {
			error = String((e as Error)?.message ?? e);
		}
	}

	function choose(p: string) {
		period = p;
		selected = null;
		traffic = null;
		void refresh();
	}

	onMount(() => {
		void host.uci.load('nlbwmon');
		return poll(refresh, 10_000);
	});
</script>

{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}

<Section title={t('nlbw.title')} description={t('nlbw.help')} testid="nlbw-summary">
	{#snippet actions()}
		{#if traffic}
			<span
				class="badge {traffic.running ? 'badge-success' : 'badge-ghost'}"
				data-testid="nlbw-state"
				>{traffic.running ? t('nlbw.running') : t('nlbw.stopped')}</span
			>
		{/if}
	{/snippet}
	<div class="w-56">
		<Select
			label={t('nlbw.period')}
			options={[
				{ value: '', label: t('nlbw.current') },
				...periods.map((p) => ({
					value: p,
					label: t('nlbw.since', { date: formatPeriod(p) }),
				})),
			]}
			value={period}
			onchange={choose}
			testid="nlbw-period"
		/>
	</div>
	<dl class="max-w-md">
		<Stat label={t('nlbw.download')} value={formatBytes(total.rx)} testid="nlbw-total-rx" />
		<Stat label={t('nlbw.upload')} value={formatBytes(total.tx)} testid="nlbw-total-tx" />
		<Stat label={t('nlbw.connections')} value={total.conns.toLocaleString(host.locale)} />
		<Stat label={t('nlbw.clients')} value={traffic?.clients.length ?? null} />
	</dl>
</Section>

<Section>
	<Tabs
		tabs={[
			{ id: 'clients', label: t('nlbw.by_client') },
			{ id: 'protocols', label: t('nlbw.by_protocol') },
		]}
		bind:active={tab}
	>
		{#snippet children(active)}
			{#if active === 'clients'}
				<DataTable
					testid="nlbw-clients"
					rows={traffic?.clients ?? []}
					rowKey={(c) => c.mac}
					filter
					sortKey="total"
					sortDir="desc"
					empty={t('nlbw.no_data')}
					columns={[
						{ key: 'host', label: t('nlbw.host'), sortable: true, value: name },
						{ key: 'mac', label: t('nlbw.mac'), sortable: true },
						{
							key: 'rx_bytes',
							label: t('nlbw.download'),
							align: 'right',
							sortable: true,
						},
						{
							key: 'tx_bytes',
							label: t('nlbw.upload'),
							align: 'right',
							sortable: true,
						},
						{
							key: 'total',
							label: t('nlbw.share'),
							align: 'right',
							sortable: true,
							value: volume,
						},
						{
							key: 'conns',
							label: t('nlbw.connections'),
							align: 'right',
							sortable: true,
						},
					]}
				>
					{#snippet cell(c, col)}
						{#if col.key === 'host'}
							<button
								type="button"
								class="link text-left"
								aria-expanded={selected === c.mac}
								onclick={() => (selected = selected === c.mac ? null : c.mac)}
								data-testid="nlbw-client">{name(c)}</button
							>
							{#if c.hostname || c.ips.length > 1}
								<div class="text-base-content/70 font-mono text-xs">
									{c.ips.join(', ')}
								</div>
							{/if}
						{:else if col.key === 'mac'}<span class="font-mono text-xs">{c.mac}</span>
						{:else if col.key === 'rx_bytes'}{formatBytes(c.rx_bytes)}
						{:else if col.key === 'tx_bytes'}{formatBytes(c.tx_bytes)}
						{:else if col.key === 'total'}
							<span class="inline-flex items-center gap-2">
								<progress
									class="progress progress-primary w-16"
									value={share(c)}
									max="1"
									aria-hidden="true"
								></progress>
								{formatPercent(share(c))}
							</span>
						{:else}{c.conns.toLocaleString(host.locale)}{/if}
					{/snippet}
				</DataTable>
				{#if client}
					<div class="mt-4" data-testid="nlbw-client-detail">
						<h3 class="mb-2 font-medium">
							{t('nlbw.client_protocols', { host: name(client) })}
						</h3>
						<DataTable
							rows={client.protocols}
							rowKey={(p) => p.name ?? ''}
							columns={[
								{ key: 'name', label: t('nlbw.protocol') },
								{ key: 'rx_bytes', label: t('nlbw.download'), align: 'right' },
								{ key: 'tx_bytes', label: t('nlbw.upload'), align: 'right' },
								{ key: 'conns', label: t('nlbw.connections'), align: 'right' },
							]}
						>
							{#snippet cell(p, col)}
								{#if col.key === 'name'}{p.name ?? t('nlbw.other')}
								{:else if col.key === 'rx_bytes'}{formatBytes(p.rx_bytes)}
								{:else if col.key === 'tx_bytes'}{formatBytes(p.tx_bytes)}
								{:else}{p.conns.toLocaleString(host.locale)}{/if}
							{/snippet}
						</DataTable>
					</div>
				{/if}
			{:else}
				<DataTable
					testid="nlbw-protocols"
					rows={traffic?.protocols ?? []}
					rowKey={(p) => p.name}
					filter
					sortKey="total"
					sortDir="desc"
					empty={t('nlbw.no_data')}
					columns={[
						{ key: 'name', label: t('nlbw.protocol'), sortable: true },
						{
							key: 'rx_bytes',
							label: t('nlbw.download'),
							align: 'right',
							sortable: true,
						},
						{
							key: 'tx_bytes',
							label: t('nlbw.upload'),
							align: 'right',
							sortable: true,
						},
						{
							key: 'total',
							label: t('nlbw.share'),
							align: 'right',
							sortable: true,
							value: volume,
						},
						{
							key: 'clients',
							label: t('nlbw.clients'),
							align: 'right',
							sortable: true,
						},
						{
							key: 'conns',
							label: t('nlbw.connections'),
							align: 'right',
							sortable: true,
						},
					]}
				>
					{#snippet cell(p, col)}
						{#if col.key === 'rx_bytes'}{formatBytes(p.rx_bytes)}
						{:else if col.key === 'tx_bytes'}{formatBytes(p.tx_bytes)}
						{:else if col.key === 'total'}{formatPercent(share(p))}
						{:else if col.key === 'name'}{p.name}
						{:else if col.key === 'clients'}{p.clients}
						{:else}{p.conns.toLocaleString(host.locale)}{/if}
					{/snippet}
				</DataTable>
			{/if}
		{/snippet}
	</Tabs>
</Section>

{#if uci.isLoaded('nlbwmon') && uci.sections('nlbwmon', 'nlbwmon').length}
	<Section title={t('nlbw.settings')} description={t('nlbw.settings_help')}>
		<TextField
			label={t('nlbw.interval')}
			uci="{S}.database_interval"
			description={t('nlbw.interval_help')}
			validate={(v) =>
				!v || /^-?([1-9]|[12][0-9]|3[01])$|^\d{4}-\d{2}-\d{2}\/\d{1,3}$/.test(v)
					? null
					: 'nlbw.interval_invalid'}
			testid="nlbw-interval"
		/>
		<DynamicList
			label={t('nlbw.networks')}
			uci="{S}.local_network"
			description={t('nlbw.networks_help')}
			validate={(v) => (/^[A-Za-z0-9_]+$/.test(v) ? null : validators.ipOrCidr(v))}
			testid="nlbw-networks"
		/>
		<TextField
			label={t('nlbw.refresh')}
			uci="{S}.refresh_interval"
			description={t('nlbw.duration_help')}
			validate={duration}
		/>
		<TextField
			label={t('nlbw.commit')}
			uci="{S}.commit_interval"
			description={t('nlbw.commit_help')}
			validate={duration}
		/>
		<TextField
			label={t('nlbw.directory')}
			uci="{S}.database_directory"
			description={t('nlbw.directory_help')}
			validate={(v) => (/^\/[A-Za-z0-9._/-]*$/.test(v) ? null : 'nlbw.directory_invalid')}
		/>
		<TextField
			label={t('nlbw.generations')}
			uci="{S}.database_generations"
			validate={validators.integer(0, 1000)}
		/>
		<TextField
			label={t('nlbw.limit')}
			uci="{S}.database_limit"
			description={t('nlbw.limit_help')}
			validate={validators.integer(0, 10_000_000)}
		/>
		<Toggle label={t('nlbw.compress')} uci="{S}.database_compress" default={true} />
	</Section>
{/if}
