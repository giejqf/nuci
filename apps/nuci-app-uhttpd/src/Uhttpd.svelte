<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	System → Web server: uhttpd's listeners, limits and certificate settings
	(the "main" and "defaults" sections, staged in the host; an apply is
	protected by the rollback protocol like a network change, ADR-0002), the
	running listeners, and the certificate with a new one on request
	(nuci.uhttpd regenerate, a job). NuCI's own handler entries are not
	shown and max_requests stays at 6 or more (AGENTS.md §3.1).
-->
<script lang="ts">
	import { KeyRound } from '@lucide/svelte';
	import type { HostContext } from '@nuci/app-sdk';
	import { t } from '@nuci/i18n';
	import {
		DynamicList,
		formatDateTime,
		getNuciContext,
		Modal,
		poll,
		Section,
		Select,
		TextField,
		Toggle,
		toasts,
		validators,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { uhttpdApi, type Status } from './api';

	let { host }: { host: HostContext } = $props();
	const uci = getNuciContext().uci;
	const api = $derived(uhttpdApi(host));

	let st = $state<Status | null>(null);
	let confirmOpen = $state(false);
	let renewing = $state<string | null>(null);
	const canWrite = $derived(host.hasAccess('nuci-app-uhttpd', 'write'));
	const hasMain = $derived(uci.isLoaded('uhttpd') && !!uci.getSection('uhttpd', 'main'));
	const hasDefaults = $derived(uci.isLoaded('uhttpd') && !!uci.getSection('uhttpd', 'defaults'));
	const keyType = $derived(String(uci.get('uhttpd', 'defaults', 'key_type') ?? 'ec'));

	// "port", "addr:port" or "[v6addr]:port", as uhttpd's -p/-s take them.
	const listener = (v: string) =>
		v === '' || /^((\d{1,3}(\.\d{1,3}){3}|\[[0-9A-Fa-f:.]+\]):)?\d{1,5}$/.test(v)
			? null
			: 'uhttpd.listener_invalid';

	async function refresh() {
		try {
			const s = await api.status();
			st = s;
			// A new certificate is in place once its serial differs.
			if (renewing !== null && s.cert && !s.cert.missing && s.cert.serial !== renewing) {
				renewing = null;
				toasts.success(t('uhttpd.renewed'));
			}
		} catch {
			// uhttpd restarts while a certificate is renewed: keep polling
		}
	}

	onMount(() => {
		void host.uci.load('uhttpd');
		return poll(refresh, 3000);
	});

	async function regenerate() {
		confirmOpen = false;
		const before = st?.cert?.serial ?? '';
		try {
			await api.regenerate();
			renewing = before;
		} catch (e) {
			toasts.error(String((e as Error)?.message ?? e));
		}
	}
</script>

<Section title={t('uhttpd.status')} description={t('uhttpd.help')}>
	{#if st}
		<div class="flex flex-wrap items-center gap-2">
			<span class="badge {st.running ? 'badge-success' : 'badge-ghost'}"
				>{st.running ? t('uhttpd.running') : t('uhttpd.stopped')}</span
			>
		</div>
		{#each st.instances as i (i.name)}
			<dl
				class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm"
				data-testid="uhttpd-listeners"
			>
				<dt class="text-base-content/70">HTTP</dt>
				<dd class="font-mono text-xs">{i.http.join(', ') || '—'}</dd>
				<dt class="text-base-content/70">HTTPS</dt>
				<dd class="font-mono text-xs">{i.https.join(', ') || '—'}</dd>
			</dl>
		{/each}
	{:else}
		<span class="loading loading-spinner" role="status" aria-label={t('uhttpd.loading')}></span>
	{/if}
</Section>

<Section title={t('uhttpd.cert')} description={t('uhttpd.cert_help')} testid="uhttpd-cert">
	{#if st?.cert && !st.cert.missing}
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
			<dt class="text-base-content/70">{t('uhttpd.subject')}</dt>
			<dd class="break-all" data-testid="uhttpd-subject">{st.cert.subject}</dd>
			<dt class="text-base-content/70">{t('uhttpd.issuer')}</dt>
			<dd class="break-all">
				{st.cert.self_signed ? t('uhttpd.self_signed') : st.cert.issuer}
			</dd>
			<dt class="text-base-content/70">{t('uhttpd.valid')}</dt>
			<dd data-testid="uhttpd-valid">
				{t('uhttpd.valid_range', {
					from: formatDateTime(st.cert.not_before),
					until: formatDateTime(st.cert.not_after),
				})}
			</dd>
			<dt class="text-base-content/70">{t('uhttpd.key')}</dt>
			<dd>{st.cert.key ?? '—'}</dd>
			<dt class="text-base-content/70">{t('uhttpd.serial')}</dt>
			<dd class="font-mono text-xs break-all" data-testid="uhttpd-serial">
				{st.cert.serial}
			</dd>
		</dl>
	{:else if st?.cert?.missing}
		<p class="text-sm" data-testid="uhttpd-no-cert">{t('uhttpd.no_cert')}</p>
	{/if}
	{#if st && !st.generator}
		<div role="alert" class="alert alert-warning">{t('uhttpd.no_generator')}</div>
	{/if}
	{#if renewing !== null}
		<div role="status" aria-live="polite" class="alert alert-info">
			<span class="loading loading-spinner" aria-hidden="true"></span>{t('uhttpd.renewing')}
		</div>
	{/if}
	{#if canWrite && st?.generator}
		<div>
			<button
				type="button"
				class="btn btn-sm"
				disabled={renewing !== null || st.job.running}
				onclick={() => (confirmOpen = true)}
				data-testid="uhttpd-regenerate"
				><KeyRound size={16} aria-hidden="true" />{t('uhttpd.regenerate')}</button
			>
		</div>
	{/if}
</Section>

{#if hasMain}
	<Section title={t('uhttpd.listeners')} description={t('uhttpd.listeners_help')}>
		<DynamicList
			label={t('uhttpd.listen_http')}
			uci="uhttpd.main.listen_http"
			validate={listener}
			placeholder="0.0.0.0:80"
			testid="uhttpd-http"
		/>
		<DynamicList
			label={t('uhttpd.listen_https')}
			uci="uhttpd.main.listen_https"
			validate={listener}
			placeholder="0.0.0.0:443"
			testid="uhttpd-https"
		/>
		<Toggle
			label={t('uhttpd.redirect')}
			uci="uhttpd.main.redirect_https"
			description={t('uhttpd.redirect_help')}
			testid="uhttpd-redirect"
		/>
		<Toggle
			label={t('uhttpd.rfc1918')}
			uci="uhttpd.main.rfc1918_filter"
			description={t('uhttpd.rfc1918_help')}
		/>
	</Section>

	<Section title={t('uhttpd.limits')}>
		<TextField
			label={t('uhttpd.max_requests')}
			uci="uhttpd.main.max_requests"
			validate={validators.integer(6, 1000)}
			placeholder="6"
			description={t('uhttpd.max_requests_help')}
			testid="uhttpd-max-requests"
		/>
		<TextField
			label={t('uhttpd.max_connections')}
			uci="uhttpd.main.max_connections"
			validate={validators.integer(1, 10000)}
			placeholder="100"
		/>
		<TextField
			label={t('uhttpd.script_timeout')}
			uci="uhttpd.main.script_timeout"
			validate={validators.integer(30, 3600)}
			placeholder="60"
			description={t('uhttpd.script_timeout_help')}
		/>
		<TextField
			label={t('uhttpd.network_timeout')}
			uci="uhttpd.main.network_timeout"
			validate={validators.integer(1, 3600)}
			placeholder="30"
		/>
		<TextField
			label={t('uhttpd.keepalive')}
			uci="uhttpd.main.http_keepalive"
			validate={validators.integer(0, 3600)}
			placeholder="20"
			description={t('uhttpd.keepalive_help')}
			testid="uhttpd-keepalive"
		/>
		<Toggle label={t('uhttpd.tcp_keepalive')} uci="uhttpd.main.tcp_keepalive" default={true} />
		<Toggle label={t('uhttpd.no_dirlists')} uci="uhttpd.main.no_dirlists" />
	</Section>
{/if}

{#if hasDefaults}
	<Section title={t('uhttpd.new_cert')} description={t('uhttpd.new_cert_help')}>
		<Select
			label={t('uhttpd.key_type')}
			uci="uhttpd.defaults.key_type"
			options={[
				{ value: 'ec', label: t('uhttpd.key_ec') },
				{ value: 'rsa', label: 'RSA' },
			]}
			placeholder="RSA"
		/>
		{#if keyType === 'ec'}
			<Select
				label={t('uhttpd.curve')}
				uci="uhttpd.defaults.ec_curve"
				options={['P-256', 'P-384'].map((c) => ({ value: c, label: c }))}
				placeholder="P-256"
			/>
		{:else}
			<Select
				label={t('uhttpd.bits')}
				uci="uhttpd.defaults.bits"
				options={['2048', '3072', '4096'].map((b) => ({ value: b, label: b }))}
				placeholder="2048"
			/>
		{/if}
		<TextField
			label={t('uhttpd.days')}
			uci="uhttpd.defaults.days"
			validate={validators.integer(1, 3650)}
			placeholder="397"
			description={t('uhttpd.days_help')}
		/>
		<TextField
			label={t('uhttpd.commonname')}
			uci="uhttpd.defaults.commonname"
			placeholder="OpenWrt"
			description={t('uhttpd.commonname_help')}
			testid="uhttpd-cn"
		/>
		<TextField label={t('uhttpd.organization')} uci="uhttpd.defaults.organization" />
		<TextField label={t('uhttpd.country')} uci="uhttpd.defaults.country" placeholder="ZZ" />
		<TextField label={t('uhttpd.state')} uci="uhttpd.defaults.state" />
		<TextField label={t('uhttpd.location')} uci="uhttpd.defaults.location" />
	</Section>
{/if}

<Modal open={confirmOpen} title={t('uhttpd.regenerate')} onclose={() => (confirmOpen = false)}>
	<p>{t('uhttpd.regenerate_confirm')}</p>
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (confirmOpen = false)}
			>{t('ui.cancel')}</button
		>
		<button
			type="button"
			class="btn btn-primary"
			onclick={regenerate}
			data-testid="uhttpd-regenerate-go">{t('uhttpd.regenerate')}</button
		>
	{/snippet}
</Modal>
