<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Network → Diagnostics: ping, traceroute, nslookup (nuci.diag jobs, polled output). -->
<script lang="ts">
	import { Play } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { isRpcError, type JobStatus } from '@nuci/rpc';
	import { Page, Section, Select, TextField, validators } from '@nuci/ui';
	import { rpc } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	let tool = $state<'ping' | 'traceroute' | 'nslookup'>('ping');
	let host = $state('openwrt.org');
	let family = $state('');
	let server = $state('');
	let job = $state<JobStatus | null>(null);
	let error = $state('');
	let running = $state(false);

	const hostError = $derived(
		host === ''
			? 'validate.required'
			: validators.hostname(host) && validators.ipaddr(host)
				? 'diag.host_invalid'
				: null,
	);

	async function run(e: SubmitEvent) {
		e.preventDefault();
		if (hostError) return;
		error = '';
		running = true;
		const fam = family === '4' ? 4 : family === '6' ? 6 : undefined;
		try {
			job =
				tool === 'ping'
					? await rpc.nuci.diag.ping(host, 4, fam)
					: tool === 'traceroute'
						? await rpc.nuci.diag.traceroute(host, fam)
						: await rpc.nuci.diag.nslookup(host, server || undefined);
			while (job.running) {
				await new Promise((r) => setTimeout(r, 1000));
				job = await rpc.nuci.diag.status();
			}
		} catch (err) {
			error =
				isRpcError(err) && err.code === 6
					? t('diag.busy')
					: isRpcError(err)
						? t(err.messageKey)
						: String(err);
		} finally {
			running = false;
		}
	}
</script>

<Page title={t('diag.title')} description={t('diag.description')}>
	<Section>
		<form class="flex flex-wrap items-end gap-3" onsubmit={run} data-testid="diag-form">
			<div class="w-40">
				<Select
					label={t('diag.tool')}
					bind:value={tool}
					options={['ping', 'traceroute', 'nslookup'].map((x) => ({
						value: x,
						label: t(`diag.tools.${x}`),
					}))}
					testid="diag-tool"
				/>
			</div>
			<div class="w-72">
				<TextField
					label={t('diag.host')}
					bind:value={host}
					validate={() => hostError}
					testid="diag-host"
				/>
			</div>
			{#if tool === 'nslookup'}
				<div class="w-48">
					<TextField
						label={t('diag.server')}
						bind:value={server}
						validate={validators.ipaddr}
						placeholder={t('diag.server_default')}
					/>
				</div>
			{:else}
				<div class="w-32">
					<Select
						label={t('diag.family')}
						bind:value={family}
						options={[
							{ value: '', label: t('diag.auto') },
							{ value: '4', label: 'IPv4' },
							{ value: '6', label: 'IPv6' },
						]}
					/>
				</div>
			{/if}
			<button
				type="submit"
				class="btn btn-primary btn-sm mb-2"
				disabled={running || !!hostError || !session.acl.canCall('nuci.diag', tool)}
				data-testid="diag-run"
			>
				{#if running}<span class="loading loading-spinner loading-xs" aria-hidden="true"
					></span>{:else}<Play size={16} aria-hidden="true" />{/if}{t('diag.run')}
			</button>
		</form>
		{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
		{#if job}
			<pre
				class="bg-base-200 rounded-box max-h-[60vh] overflow-auto p-3 text-xs"
				aria-live="polite"
				data-testid="diag-output">{job.log || '…'}</pre>
			{#if !job.running && job.rc !== undefined}
				<p class="text-sm">
					<span class="badge badge-sm {job.rc === 0 ? 'badge-success' : 'badge-warning'}"
						>{t('diag.exit', { rc: job.rc })}</span
					>
				</p>
			{/if}
		{/if}
	</Section>
</Page>
