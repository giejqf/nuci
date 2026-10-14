<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Services → frp client: the server connection and the proxies (frpc's
	uci "conf" sections, staged in the host; an apply restarts frpc), the
	proxies' state from frpc's local admin API, its log, and start/stop and
	start-at-boot (nuci.frpc service, a job).
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
	import { frpcApi, type Action, type Status } from './api';

	let { host }: { host: HostContext } = $props();
	const uci = getNuciContext().uci;
	const api = $derived(frpcApi(host));

	let st = $state<Status | null>(null);
	let busy = $state(false);
	const canRun = $derived(host.hasAccess('nuci-app-frpc', 'write'));
	const working = $derived(busy || !!st?.job.running);
	const loaded = $derived(uci.isLoaded('frpc'));
	const hasCommon = $derived(loaded && !!uci.getSection('frpc', 'common'));

	const TYPES = ['tcp', 'udp', 'http', 'https', 'stcp', 'xtcp'];
	const typeOf = (s: string) => String(uci.get('frpc', s, 'type') ?? 'tcp');
	const nameOf = (s: string) => String(uci.get('frpc', s, 'name') ?? '') || s;
	const proxyName = (v: string) =>
		v === '' || /^[A-Za-z0-9_.-]{1,64}$/.test(v) ? null : 'frpc.name_invalid';
	const hostOrIp = (v: string) =>
		v === '' || validators.ipaddr(v) === null || validators.hostname(v) === null
			? null
			: 'frpc.host_invalid';

	const adminOn = $derived(loaded && !!uci.get('frpc', 'common', 'admin_port'));
	function setAdmin(on: boolean) {
		uci.set('frpc', 'common', 'admin_addr', on ? '127.0.0.1' : null);
		uci.set('frpc', 'common', 'admin_port', on ? '7400' : null);
	}

	async function refresh() {
		try {
			st = await api.status();
		} catch {
			// best effort: the configuration stays usable
		}
	}

	onMount(() => {
		void host.uci.load('frpc');
		return poll(refresh, 3000);
	});

	async function run(action: Action) {
		busy = true;
		try {
			await api.service(action);
			toasts.success(t(`frpc.started.${action}`));
			await refresh();
		} catch (e) {
			toasts.error(String((e as Error)?.message ?? e));
		} finally {
			busy = false;
		}
	}

	const stateOf = (s: string) => {
		const p = st?.proxies?.find((x) => x.name === nameOf(s));
		if (!p) return st?.running && st.proxies ? t('frpc.state.none') : '—';
		return p.error ? `${p.status}: ${p.error}` : p.status;
	};
</script>

<Section title={t('frpc.status')} description={t('frpc.help')}>
	{#if st}
		<div class="flex flex-wrap items-center gap-2">
			<span
				class="badge {st.running ? 'badge-success' : 'badge-ghost'}"
				data-testid="frpc-running"
				>{st.running ? t('frpc.running') : t('frpc.stopped')}</span
			>
			<span class="badge badge-ghost" data-testid="frpc-boot"
				>{st.enabled ? t('frpc.boot_on') : t('frpc.boot_off')}</span
			>
		</div>
		{#if st.running && !st.admin}
			<p class="text-sm">{t('frpc.no_admin')}</p>
		{/if}
		{#if canRun}
			<div class="flex flex-wrap gap-2">
				{#if st.running}
					<button
						type="button"
						class="btn btn-sm"
						disabled={working}
						onclick={() => run('stop')}
						data-testid="frpc-stop"
						><Square size={16} aria-hidden="true" />{t('frpc.stop')}</button
					>
					<button
						type="button"
						class="btn btn-sm"
						disabled={working}
						onclick={() => run('restart')}
						data-testid="frpc-restart"
						><RotateCw size={16} aria-hidden="true" />{t('frpc.restart')}</button
					>
				{:else}
					<button
						type="button"
						class="btn btn-sm btn-primary"
						disabled={working}
						onclick={() => run('start')}
						data-testid="frpc-start"
						><Play size={16} aria-hidden="true" />{t('frpc.start')}</button
					>
				{/if}
				<button
					type="button"
					class="btn btn-sm btn-ghost"
					disabled={working}
					onclick={() => run(st!.enabled ? 'disable' : 'enable')}
					data-testid="frpc-boot-toggle"
					>{st.enabled ? t('frpc.disable') : t('frpc.enable')}</button
				>
			</div>
		{/if}
		{#if st.log.length}
			<details>
				<summary class="cursor-pointer text-sm">{t('frpc.log')}</summary>
				<!-- Scrollable region: focusable so keyboard users can scroll it. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<pre
					class="bg-base-200 mt-2 max-h-64 overflow-auto rounded p-2 text-xs whitespace-pre-wrap"
					tabindex="0"
					aria-label={t('frpc.log')}
					data-testid="frpc-log">{st.log
						.map((l) => [l.time, l.level, l.text].filter(Boolean).join(' '))
						.join('\n')}</pre>
			</details>
		{/if}
	{:else}
		<span class="loading loading-spinner" aria-label={t('frpc.loading')}></span>
	{/if}
</Section>

{#if hasCommon}
	<Section title={t('frpc.server')} description={t('frpc.server_help')}>
		<TextField
			label={t('frpc.server_addr')}
			uci="frpc.common.server_addr"
			validate={validators.all(validators.required, hostOrIp)}
			testid="frpc-server"
		/>
		<TextField
			label={t('frpc.server_port')}
			uci="frpc.common.server_port"
			validate={validators.port}
			placeholder="7000"
			testid="frpc-server-port"
		/>
		<TextField
			label={t('frpc.token')}
			uci="frpc.common.token"
			type="password"
			description={t('frpc.token_help')}
			testid="frpc-token"
		/>
		<TextField
			label={t('frpc.user')}
			uci="frpc.common.user"
			description={t('frpc.user_help')}
		/>
		<Select
			label={t('frpc.protocol')}
			uci="frpc.common.protocol"
			options={['tcp', 'kcp', 'quic', 'websocket', 'wss'].map((p) => ({
				value: p,
				label: p,
			}))}
			placeholder="tcp"
		/>
		<Toggle
			label={t('frpc.tls')}
			uci="frpc.common.tls_enable"
			on="true"
			off="false"
			default={true}
			description={t('frpc.tls_help')}
		/>
		<Toggle
			label={t('frpc.admin')}
			checked={adminOn}
			readonly={!canRun}
			description={t('frpc.admin_help')}
			testid="frpc-admin"
			onchange={setAdmin}
		/>
	</Section>
{/if}

{#if loaded}
	<Section title={t('frpc.proxies')} description={t('frpc.proxies_help')}>
		<SectionList
			config="frpc"
			type="conf"
			filter={(s) => s !== 'common'}
			testid="frpc-proxies"
			addLabel={t('frpc.add')}
			editTitle={t('frpc.proxy')}
			defaults={{ type: 'tcp', local_ip: '127.0.0.1' }}
			columns={[
				{ option: 'name', label: t('frpc.name'), format: (_v, s) => nameOf(s) },
				{ option: 'type', label: t('frpc.type'), format: (v) => String(v ?? 'tcp') },
				{
					option: 'local_port',
					label: t('frpc.local'),
					format: (v, s) =>
						`${uci.get('frpc', s, 'local_ip') ?? '127.0.0.1'}:${v ?? '—'}`,
				},
				{
					option: 'remote_port',
					label: t('frpc.remote'),
					format: (v, s) =>
						['http', 'https'].includes(typeOf(s))
							? String(
									uci.get('frpc', s, 'custom_domains') ??
										uci.get('frpc', s, 'subdomain') ??
										'—',
								)
							: v
								? String(v)
								: '—',
				},
				{
					option: 'name',
					key: 'state',
					label: t('frpc.state'),
					format: (_v, s) => stateOf(s),
				},
			]}
		>
			{#snippet editor(s)}
				{@const ty = typeOf(s)}
				<TextField
					label={t('frpc.name')}
					uci="frpc.{s}.name"
					validate={validators.all(validators.required, proxyName)}
					description={t('frpc.name_help')}
					testid="frpc-proxy-name"
				/>
				<Select
					label={t('frpc.type')}
					uci="frpc.{s}.type"
					options={TYPES.map((x) => ({ value: x, label: t(`frpc.type.${x}`) }))}
					testid="frpc-proxy-type"
				/>
				<TextField
					label={t('frpc.local_ip')}
					uci="frpc.{s}.local_ip"
					validate={hostOrIp}
					placeholder="127.0.0.1"
				/>
				<TextField
					label={t('frpc.local_port')}
					uci="frpc.{s}.local_port"
					validate={validators.all(validators.required, validators.port)}
					testid="frpc-proxy-local-port"
				/>
				{#if ty === 'tcp' || ty === 'udp'}
					<TextField
						label={t('frpc.remote_port')}
						uci="frpc.{s}.remote_port"
						validate={validators.all(validators.required, validators.port)}
						description={t('frpc.remote_port_help')}
						testid="frpc-proxy-remote-port"
					/>
				{:else if ty === 'http' || ty === 'https'}
					<TextField
						label={t('frpc.custom_domains')}
						uci="frpc.{s}.custom_domains"
						description={t('frpc.custom_domains_help')}
					/>
					<TextField
						label={t('frpc.subdomain')}
						uci="frpc.{s}.subdomain"
						description={t('frpc.subdomain_help')}
					/>
				{:else}
					<TextField
						label={t('frpc.sk')}
						uci="frpc.{s}.sk"
						type="password"
						validate={validators.required}
						description={t('frpc.sk_help')}
					/>
				{/if}
				<Toggle
					label={t('frpc.encryption')}
					uci="frpc.{s}.use_encryption"
					on="true"
					off="false"
				/>
				<Toggle
					label={t('frpc.compression')}
					uci="frpc.{s}.use_compression"
					on="true"
					off="false"
				/>
			{/snippet}
		</SectionList>
	</Section>
{/if}
