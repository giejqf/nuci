<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Services → Dynamic DNS: ddns-scripts services (uci ddns) with provider
	selection, live status and logs. Changes are staged in the host.
-->
<script lang="ts">
	import { FileText, RefreshCw } from '@lucide/svelte';
	import type { HostContext } from '@nuci/app-sdk';
	import { t } from '@nuci/i18n';
	import {
		formatDateTime,
		getNuciContext,
		Modal,
		Section,
		SectionList,
		Select,
		TextField,
		Toggle,
		toasts,
		validators,
		poll,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { ddnsApi, type Provider, type ServiceStatus } from './api';

	let { host }: { host: HostContext } = $props();
	const uci = getNuciContext().uci;

	const api = $derived(ddnsApi(host));
	let providers = $state<Provider[]>([]);
	let status = $state<Record<string, ServiceStatus>>({});
	let busy = $state(false);
	let logOf = $state<string | null>(null);
	let logText = $state('');

	const ifaces = $derived(
		uci.isLoaded('network')
			? uci
					.sections('network', 'interface')
					.map((s) => s['.name'])
					.filter((n) => n !== 'loopback')
			: [],
	);
	const canUpdate = $derived(host.hasAccess('nuci-app-ddns', 'write'));

	async function refresh() {
		try {
			status = await api.status();
		} catch {
			// status is best effort; the configuration stays usable
		}
	}

	onMount(() => {
		void host.uci.load('ddns', 'network');
		void api
			.providers()
			.then((p) => (providers = p))
			.catch(() => {});
		return poll(refresh, 5000);
	});

	async function updateNow() {
		busy = true;
		try {
			await api.update();
			toasts.success(t('ddns.update_started'));
			setTimeout(refresh, 3000);
		} catch (e) {
			toasts.error(String((e as Error)?.message ?? e));
		} finally {
			busy = false;
		}
	}

	async function showLog(section: string) {
		logOf = section;
		logText = '';
		try {
			logText = await api.log(section);
		} catch (e) {
			logText = String((e as Error)?.message ?? e);
		}
	}

	const describe = (name: string) => {
		const s = status[name];
		if (!s) return '—';
		const parts = [s.running ? t('ddns.running') : t('ddns.stopped')];
		if (s.registered_ip) parts.push(t('ddns.registered', { ip: s.registered_ip }));
		if (s.last_update) parts.push(t('ddns.updated', { time: formatDateTime(s.last_update) }));
		return parts.join(' · ');
	};
</script>

<Section title={t('ddns.global')} description={t('ddns.help')}>
	{#if uci.isLoaded('ddns')}
		<Toggle
			label={t('ddns.private_ip')}
			uci="ddns.global.upd_privateip"
			default={false}
			description={t('ddns.private_ip_help')}
			testid="ddns-private"
		/>
	{/if}
	{#if canUpdate}
		<div>
			<button
				type="button"
				class="btn btn-sm"
				disabled={busy}
				onclick={updateNow}
				data-testid="ddns-update"
				><RefreshCw size={16} aria-hidden="true" />{t('ddns.update_now')}</button
			>
		</div>
	{/if}
</Section>

{#if uci.isLoaded('ddns')}
	<Section title={t('ddns.services')}>
		<SectionList
			config="ddns"
			type="service"
			testid="ddns-services"
			addLabel={t('ddns.add')}
			editTitle={t('ddns.service')}
			defaults={{
				enabled: '1',
				use_ipv6: '0',
				ip_source: 'network',
				ip_network: 'wan',
				interface: 'wan',
				check_interval: '10',
				check_unit: 'minutes',
			}}
			columns={[
				{ option: 'domain', label: t('ddns.domain') },
				{
					option: 'service_name',
					label: t('ddns.provider'),
					format: (v) => (v ? String(v) : t('ddns.custom')),
				},
				{
					option: 'enabled',
					label: t('ddns.state'),
					format: (v, s) => (v === '1' ? describe(s) : t('ddns.disabled')),
				},
			]}
		>
			{#snippet editor(s)}
				{@const custom = !uci.get('ddns', s, 'service_name')}
				<Toggle
					label={t('ddns.enabled')}
					uci="ddns.{s}.enabled"
					default={false}
					testid="ddns-enabled"
				/>
				<Select
					label={t('ddns.provider')}
					uci="ddns.{s}.service_name"
					options={providers.map((p) => ({ value: p.name, label: p.name }))}
					placeholder={t('ddns.custom')}
					testid="ddns-provider"
				/>
				{#if custom}
					<TextField
						label={t('ddns.update_url')}
						uci="ddns.{s}.update_url"
						validate={validators.required}
						description={t('ddns.update_url_help')}
						testid="ddns-url"
					/>
				{/if}
				<TextField
					label={t('ddns.domain')}
					uci="ddns.{s}.domain"
					validate={validators.required}
					testid="ddns-domain"
				/>
				<TextField
					label={t('ddns.lookup_host')}
					uci="ddns.{s}.lookup_host"
					validate={validators.required}
					description={t('ddns.lookup_host_help')}
					testid="ddns-lookup"
				/>
				<TextField label={t('ddns.username')} uci="ddns.{s}.username" />
				<TextField label={t('ddns.password')} uci="ddns.{s}.password" type="password" />
				<Toggle label={t('ddns.ipv6')} uci="ddns.{s}.use_ipv6" default={false} />
				<Select
					label={t('ddns.ip_network')}
					uci="ddns.{s}.ip_network"
					options={ifaces.map((n) => ({ value: n, label: n }))}
					description={t('ddns.ip_network_help')}
				/>
				<TextField
					label={t('ddns.check_interval')}
					uci="ddns.{s}.check_interval"
					validate={validators.integer(1, 1440)}
				/>
				<button
					type="button"
					class="btn btn-ghost btn-sm"
					onclick={() => showLog(s)}
					data-testid="ddns-log"
					><FileText size={16} aria-hidden="true" />{t('ddns.log')}</button
				>
			{/snippet}
		</SectionList>
	</Section>
{/if}

<Modal
	open={logOf !== null}
	title={t('ddns.log_of', { name: logOf ?? '' })}
	onclose={() => (logOf = null)}
>
	<pre
		class="bg-base-200 max-h-96 overflow-auto rounded p-2 text-xs"
		data-testid="ddns-log-text">{logText || t('ddns.no_log')}</pre>
	{#snippet actions()}
		<button type="button" class="btn" onclick={() => (logOf = null)}>{t('ui.close')}</button>
	{/snippet}
</Modal>
