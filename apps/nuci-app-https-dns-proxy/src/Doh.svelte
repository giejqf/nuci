<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Services → DNS over HTTPS: https-dns-proxy instances (staged in the host;
	an apply reloads the service), its settings, and the running state with
	start/stop and start-at-boot (nuci.https-dns-proxy service, a job).
-->
<script lang="ts">
	import { Play, RotateCw, Square } from '@lucide/svelte';
	import type { HostContext } from '@nuci/app-sdk';
	import { t } from '@nuci/i18n';
	import {
		getNuciContext,
		poll,
		Section,
		SectionList,
		Select,
		TextField,
		Toggle,
		toasts,
		validators,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { dohApi, type Action, type Status } from './api';
	import { PROVIDERS, providerOf, type Provider } from './providers';

	let { host }: { host: HostContext } = $props();
	const uci = getNuciContext().uci;
	const api = $derived(dohApi(host));
	const CONFIG = 'https-dns-proxy';

	let st = $state<Status | null>(null);
	let busy = $state(false);
	const canRun = $derived(host.hasAccess('nuci-app-https-dns-proxy', 'write'));
	const working = $derived(busy || !!st?.job.running);

	const label = (p: Provider) =>
		p.variant ? `${p.name} (${t(`doh.variant.${p.variant}`)})` : p.name;
	const providerOptions = [
		...PROVIDERS.map((p) => ({ value: p.id, label: label(p) })),
		{ value: 'custom', label: t('doh.custom') },
	];
	const httpsUrl = (v: string) =>
		v === '' || /^https:\/\/[^\s/?#]+[^\s]*$/.test(v) ? null : 'doh.url_invalid';
	const bootstrapList = (v: string) =>
		v === '' ||
		v
			.split(',')
			.every(
				(a) =>
					validators.ipaddr(a.trim().replace(/^\[(.+)\](:\d+)?$|:\d+$/, '$1')) === null,
			)
			? null
			: 'doh.bootstrap_invalid';

	async function refresh() {
		try {
			st = await api.status();
		} catch {
			// best effort: the configuration stays usable
		}
	}

	onMount(() => {
		void host.uci.load(CONFIG, 'dhcp');
		return poll(refresh, 3000);
	});

	async function run(action: Action) {
		busy = true;
		try {
			await api.service(action);
			toasts.success(t(`doh.started.${action}`));
			await refresh();
		} catch (e) {
			toasts.error(String((e as Error)?.message ?? e));
		} finally {
			busy = false;
		}
	}

	function setProvider(s: string, id: string) {
		const p = PROVIDERS.find((x) => x.id === id);
		if (!p) return;
		uci.set(CONFIG, s, 'resolver_url', p.url);
		uci.set(CONFIG, s, 'bootstrap_dns', p.bootstrap);
	}

	const servers = $derived(st ? [...new Set(st.dnsmasq.flatMap((d) => d.doh_servers))] : []);
</script>

<Section title={t('doh.status')} description={t('doh.help')}>
	{#if st}
		<div class="flex flex-wrap items-center gap-2" data-testid="doh-state">
			<span
				class="badge {st.running ? 'badge-success' : 'badge-ghost'}"
				data-testid="doh-running">{st.running ? t('doh.running') : t('doh.stopped')}</span
			>
			<span class="badge badge-ghost" data-testid="doh-boot"
				>{st.enabled ? t('doh.boot_on') : t('doh.boot_off')}</span
			>
			{#if st.force_dns}<span class="badge badge-ghost">{t('doh.forcing')}</span>{/if}
		</div>
		<p class="text-sm" data-testid="doh-dnsmasq">
			{servers.length
				? t('doh.dnsmasq_uses', { servers: servers.join(', ') })
				: t('doh.dnsmasq_own')}
		</p>
		{#if st.instances.length}
			<!-- Scrollable region: focusable so keyboard users can scroll it. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="overflow-x-auto"
				role="region"
				tabindex="0"
				aria-label={t('ui.table.region')}
			>
				<table class="table-sm nuci-stack table" data-testid="doh-instances">
					<thead>
						<tr>
							<th>{t('doh.resolver')}</th>
							<th>{t('doh.listen')}</th>
							<th>{t('doh.state')}</th>
						</tr>
					</thead>
					<tbody>
						{#each st.instances as i (i.name)}
							<tr>
								<td
									class="font-mono text-xs break-all"
									data-label={t('doh.resolver')}>{i.resolver ?? '—'}</td
								>
								<td class="font-mono text-xs" data-label={t('doh.listen')}
									>{i.listen_addr}#{i.listen_port ?? '—'}</td
								>
								<td data-label={t('doh.state')}
									>{i.running ? t('doh.running') : t('doh.stopped')}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		{#if canRun}
			<div class="flex flex-wrap gap-2">
				{#if st.running}
					<button
						type="button"
						class="btn btn-sm"
						disabled={working}
						onclick={() => run('stop')}
						data-testid="doh-stop"
						><Square size={16} aria-hidden="true" />{t('doh.stop')}</button
					>
					<button
						type="button"
						class="btn btn-sm"
						disabled={working}
						onclick={() => run('restart')}
						data-testid="doh-restart"
						><RotateCw size={16} aria-hidden="true" />{t('doh.restart')}</button
					>
				{:else}
					<button
						type="button"
						class="btn btn-sm btn-primary"
						disabled={working}
						onclick={() => run('start')}
						data-testid="doh-start"
						><Play size={16} aria-hidden="true" />{t('doh.start')}</button
					>
				{/if}
				<button
					type="button"
					class="btn btn-sm btn-ghost"
					disabled={working}
					onclick={() => run(st!.enabled ? 'disable' : 'enable')}
					data-testid="doh-boot-toggle"
					>{st.enabled ? t('doh.disable') : t('doh.enable')}</button
				>
			</div>
		{/if}
		{#if st.job.rc}
			<div role="alert" class="alert alert-warning">
				<!-- Scrollable region: focusable so keyboard users can scroll it. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<pre
					class="max-h-48 overflow-auto text-xs whitespace-pre-wrap"
					role="region"
					tabindex="0"
					aria-label={t('doh.log')}>{st.job.log}</pre>
			</div>
		{/if}
	{:else}
		<span class="loading loading-spinner" aria-label={t('doh.loading')}></span>
	{/if}
</Section>

{#if uci.isLoaded(CONFIG)}
	<Section title={t('doh.resolvers')} description={t('doh.resolvers_help')}>
		<SectionList
			config={CONFIG}
			type="https-dns-proxy"
			testid="doh-resolvers"
			addLabel={t('doh.add')}
			editTitle={t('doh.resolver')}
			defaults={{
				resolver_url: PROVIDERS[0]!.url,
				bootstrap_dns: PROVIDERS[0]!.bootstrap,
			}}
			columns={[
				{
					option: 'resolver_url',
					label: t('doh.provider'),
					// A preset by name, anything else by its URL.
					format: (v) => {
						const p = providerOf(v as string | undefined);
						return p ? label(p) : String(v ?? '—');
					},
				},
				{
					option: 'listen_port',
					label: t('doh.port'),
					format: (v) => (v ? String(v) : t('doh.port_auto')),
				},
			]}
		>
			{#snippet editor(s)}
				<Select
					label={t('doh.provider')}
					options={providerOptions}
					value={providerOf(uci.get(CONFIG, s, 'resolver_url') as string | undefined)
						?.id ?? 'custom'}
					onchange={(v) => setProvider(s, v)}
					testid="doh-provider"
				/>
				<TextField
					label={t('doh.url')}
					uci="{CONFIG}.{s}.resolver_url"
					validate={validators.all(validators.required, httpsUrl)}
					placeholder="https://dns.example/dns-query"
					testid="doh-url"
				/>
				<TextField
					label={t('doh.bootstrap')}
					uci="{CONFIG}.{s}.bootstrap_dns"
					validate={bootstrapList}
					description={t('doh.bootstrap_help')}
					testid="doh-bootstrap"
				/>
				<TextField
					label={t('doh.listen_addr')}
					uci="{CONFIG}.{s}.listen_addr"
					validate={validators.ipaddr}
					placeholder="127.0.0.1"
				/>
				<TextField
					label={t('doh.port')}
					uci="{CONFIG}.{s}.listen_port"
					validate={validators.port}
					placeholder={t('doh.port_auto')}
					description={t('doh.port_help')}
					testid="doh-port"
				/>
				<TextField
					label={t('doh.ca_file')}
					uci="{CONFIG}.{s}.ca_certs_file"
					validate={(v) => (v === '' || /^\/[^\s]+$/.test(v) ? null : 'doh.path_invalid')}
					description={t('doh.ca_file_help')}
					testid="doh-ca"
				/>
			{/snippet}
		</SectionList>
	</Section>

	<Section title={t('doh.settings')}>
		<Select
			label={t('doh.dnsmasq')}
			uci="{CONFIG}.config.dnsmasq_config_update"
			options={[
				{ value: '*', label: t('doh.dnsmasq_all') },
				{ value: '-', label: t('doh.dnsmasq_none') },
			]}
			placeholder={t('doh.dnsmasq_all')}
			description={t('doh.dnsmasq_help')}
			testid="doh-dnsmasq-update"
		/>
		<Toggle
			label={t('doh.force_dns')}
			uci="{CONFIG}.config.force_dns"
			default={true}
			description={t('doh.force_dns_help')}
			testid="doh-force"
		/>
		<Toggle
			label={t('doh.canary_icloud')}
			uci="{CONFIG}.config.canary_domains_icloud"
			default={true}
			description={t('doh.canary_icloud_help')}
		/>
		<Toggle
			label={t('doh.canary_mozilla')}
			uci="{CONFIG}.config.canary_domains_mozilla"
			default={true}
			description={t('doh.canary_mozilla_help')}
		/>
		<Select
			label={t('doh.family')}
			uci="{CONFIG}.config.force_ip_family"
			options={[
				{ value: 'auto', label: t('doh.family_auto') },
				{ value: 'ipv4', label: t('doh.family_ipv4') },
				{ value: 'ipv6', label: t('doh.family_ipv6') },
			]}
			placeholder={t('doh.family_auto')}
		/>
	</Section>
{/if}
