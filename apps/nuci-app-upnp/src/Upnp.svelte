<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Services → UPnP: miniupnpd settings (uci upnpd), access rules and the
	port mappings clients requested. Changes are staged in the host.
-->
<script lang="ts">
	import type { HostContext } from '@nuci/app-sdk';
	import { t } from '@nuci/i18n';
	import {
		DataTable,
		formatDateTime,
		getNuciContext,
		Section,
		SectionList,
		Select,
		TextField,
		Toggle,
		validators,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { upnpApi, type Redirect } from './api';

	let { host }: { host: HostContext } = $props();
	const uci = getNuciContext().uci;

	const api = $derived(upnpApi(host));
	let running = $state<boolean | null>(null);
	let redirects = $state<Redirect[]>([]);

	async function refresh() {
		try {
			const s = await api.status();
			running = s.running;
			redirects = s.redirects;
		} catch {
			running = null;
		}
	}

	onMount(() => {
		void host.uci.load('upnpd');
		void refresh();
		const timer = setInterval(
			() => document.visibilityState === 'visible' && void refresh(),
			5000,
		);
		return () => clearInterval(timer);
	});
</script>

<Section title={t('upnp.settings')} description={t('upnp.help')}>
	{#snippet actions()}
		{#if running !== null}
			<span class="badge {running ? 'badge-success' : 'badge-ghost'}" data-testid="upnp-state"
				>{running ? t('upnp.running') : t('upnp.stopped')}</span
			>
		{/if}
	{/snippet}
	{#if uci.isLoaded('upnpd')}
		<Toggle
			label={t('upnp.enabled')}
			uci="upnpd.config.enabled"
			default={false}
			testid="upnp-enabled"
		/>
		<Toggle label={t('upnp.enable_upnp')} uci="upnpd.config.enable_upnp" default={true} />
		<Toggle label={t('upnp.enable_natpmp')} uci="upnpd.config.enable_natpmp" default={true} />
		<Toggle
			label={t('upnp.secure_mode')}
			uci="upnpd.config.secure_mode"
			default={true}
			description={t('upnp.secure_mode_help')}
		/>
		<TextField
			label={t('upnp.download')}
			uci="upnpd.config.download"
			validate={validators.integer(0, 100_000_000)}
			description={t('upnp.speed_help')}
		/>
		<TextField
			label={t('upnp.upload')}
			uci="upnpd.config.upload"
			validate={validators.integer(0, 100_000_000)}
		/>
		<TextField
			label={t('upnp.external_ip')}
			uci="upnpd.config.external_ip"
			validate={validators.ipv4}
			description={t('upnp.external_ip_help')}
			testid="upnp-external-ip"
		/>
	{/if}
</Section>

<Section title={t('upnp.redirects')}>
	<DataTable
		testid="upnp-redirects"
		rows={redirects}
		rowKey={(r) => `${r.proto}:${r.external_port}`}
		empty={t('upnp.no_redirects')}
		columns={[
			{ key: 'proto', label: t('upnp.proto') },
			{
				key: 'external_port',
				label: t('upnp.external_port'),
				align: 'right',
				sortable: true,
			},
			{ key: 'client', label: t('upnp.client'), sortable: true },
			{ key: 'internal_port', label: t('upnp.internal_port'), align: 'right' },
			{ key: 'description', label: t('upnp.description') },
			{ key: 'expires', label: t('upnp.expires') },
		]}
	>
		{#snippet cell(r, c)}
			{#if c.key === 'expires'}{r.expires ? formatDateTime(r.expires) : t('upnp.permanent')}
			{:else if c.key === 'client'}<span class="font-mono text-xs">{r.client}</span>
			{:else}{r[c.key as 'proto' | 'external_port' | 'internal_port' | 'description']}{/if}
		{/snippet}
	</DataTable>
</Section>

{#if uci.isLoaded('upnpd')}
	<Section title={t('upnp.rules')} description={t('upnp.rules_help')}>
		<SectionList
			config="upnpd"
			type="perm_rule"
			testid="upnp-rules"
			addLabel={t('upnp.add_rule')}
			editTitle={t('upnp.rule')}
			defaults={{
				action: 'allow',
				ext_ports: '1024-65535',
				int_addr: '0.0.0.0/0',
				int_ports: '1024-65535',
			}}
			columns={[
				{ option: 'comment', label: t('upnp.description') },
				{ option: 'action', label: t('upnp.action') },
				{ option: 'ext_ports', label: t('upnp.external_port') },
				{ option: 'int_addr', label: t('upnp.client') },
				{ option: 'int_ports', label: t('upnp.internal_port') },
			]}
		>
			{#snippet editor(s)}
				<TextField label={t('upnp.description')} uci="upnpd.{s}.comment" />
				<Select
					label={t('upnp.action')}
					uci="upnpd.{s}.action"
					options={[
						{ value: 'allow', label: t('upnp.allow') },
						{ value: 'deny', label: t('upnp.deny') },
					]}
				/>
				<TextField
					label={t('upnp.external_port')}
					uci="upnpd.{s}.ext_ports"
					validate={validators.portRange}
				/>
				<TextField
					label={t('upnp.client')}
					uci="upnpd.{s}.int_addr"
					validate={validators.ipOrCidr}
				/>
				<TextField
					label={t('upnp.internal_port')}
					uci="upnpd.{s}.int_ports"
					validate={validators.portRange}
				/>
			{/snippet}
		</SectionList>
	</Section>
{/if}
