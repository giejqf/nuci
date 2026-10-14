<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	System → Firmware upgrade: check the OpenWrt build service for a newer
	release, build an image with the installed packages, download, verify
	and install it (owut, ADR-0007). NuCI itself is carried across.
-->
<script lang="ts">
	import type { HostContext } from '@nuci/app-sdk';
	import { t } from '@nuci/i18n';
	import { DataTable, formatBytes, Modal, poll, Section, Select, TextField } from '@nuci/ui';
	import { onMount } from 'svelte';
	import { asuApi, type AsuStatus } from './api';

	let { host }: { host: HostContext } = $props();
	const api = $derived(asuApi(host));

	let st = $state<AsuStatus | null>(null);
	let target = $state('');
	let accepted = $state(false);
	let confirmOpen = $state(false);
	let phase = $state<'idle' | 'installing' | 'restarting' | 'timeout'>('idle');
	let error = $state('');

	const running = $derived(st?.job.running ?? false);
	const check = $derived(st?.check ?? null);
	const failed = $derived(!running && st?.job.rc != null && st.job.rc !== 0);
	const imageReady = $derived(
		!!st?.image && !!check?.to && st.image.version === check.to.version,
	);
	const canWrite = $derived(host.hasAccess('nuci-app-asu', 'write'));

	// Dotted release numbers; "-rcN" sorts before the release, snapshots are not offered.
	function cmp(a: string, b: string): number {
		const parse = (v: string) => {
			const [num = '', rc] = v.split('-rc');
			return [...num.split('.').map(Number), rc === undefined ? Infinity : Number(rc)];
		};
		const x = parse(a);
		const y = parse(b);
		for (let i = 0; i < Math.max(x.length, y.length); i++) {
			const d = (x[i] ?? 0) - (y[i] ?? 0);
			if (d) return d;
		}
		return 0;
	}
	const newer = $derived.by(() => {
		const from = check?.from?.version;
		if (!check || !from) return [];
		const all = Object.values(check.branches).flatMap((b) => b.versions);
		return all
			.filter((v) => !v.includes('SNAPSHOT') && cmp(v, from) > 0)
			.sort((a, b) => cmp(b, a));
	});

	async function refresh() {
		try {
			st = await api.status();
			if (!target && st.check?.to) target = st.check.to.version;
			error = '';
		} catch (e) {
			error = String((e as Error)?.message ?? e);
		}
	}

	async function step(fn: () => Promise<unknown>) {
		error = '';
		try {
			await fn();
		} catch (e) {
			error = String((e as Error)?.message ?? e);
		}
		await refresh();
	}

	// Hide the previous result (or image) at once: it no longer applies.
	const runCheck = () => {
		if (st) st = { ...st, check: null, image: null };
		return step(() => api.check(target || undefined));
	};
	const runDownload = () => {
		const version = check!.to!.version;
		if (st) st = { ...st, image: null };
		return step(() => api.download(version));
	};

	// The router flashes and reboots: wait until it stops answering, then
	// until it answers again (any ubus reply, even "access denied"), then reload.
	async function install() {
		confirmOpen = false;
		await step(() => api.install());
		if (error) return;
		phase = 'installing';
		const up = async () => {
			try {
				await host.call('system', 'board');
				return true;
			} catch (e) {
				return typeof (e as { code?: unknown })?.code === 'number';
			}
		};
		const until = Date.now() + 20 * 60_000;
		// sysupgrade never returns: an install job that ended with an error
		// while the router still answers (twice, 10 s apart, so the shutdown
		// for the flash does not count) did not flash; show why.
		let failedAt = 0;
		while (Date.now() < until && (await up())) {
			const s = await api.status().catch(() => null);
			if (s && !s.job.running && s.job.rc != null && s.job.rc !== 0) {
				failedAt ||= Date.now();
				if (Date.now() - failedAt >= 10_000) {
					st = s;
					phase = 'idle';
					return;
				}
			} else failedAt = 0;
			await new Promise((r) => setTimeout(r, 3000));
		}
		phase = 'restarting';
		while (Date.now() < until) {
			if (await up()) return location.reload();
			await new Promise((r) => setTimeout(r, 5000));
		}
		phase = 'timeout';
	}

	onMount(() => {
		void host.uci.load('attendedsysupgrade');
		return poll(() => (phase === 'idle' ? refresh() : undefined), 3000);
	});
</script>

{#if phase !== 'idle'}
	<div
		role="status"
		aria-live="polite"
		class="alert {phase === 'timeout' ? 'alert-warning' : 'alert-info'}"
		data-testid="asu-phase"
	>
		{#if phase !== 'timeout'}<span class="loading loading-spinner" aria-hidden="true"
			></span>{/if}
		{t(`asu.phase.${phase}`)}
	</div>
{/if}
{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}

<Section title={t('asu.title')} description={t('asu.help')}>
	{#if check?.from}
		<p class="text-sm" data-testid="asu-current">
			{t('asu.current', { version: check.from.version, revision: check.from.revision ?? '' })}
		</p>
	{/if}
	<div class="flex flex-wrap items-end gap-2">
		{#if newer.length}
			<div class="w-56">
				<Select
					label={t('asu.target')}
					options={newer.map((v) => ({ value: v, label: v }))}
					value={target}
					onchange={(v) => (target = v)}
					testid="asu-target"
				/>
			</div>
		{/if}
		{#if canWrite}
			<button
				type="button"
				class="btn btn-sm"
				disabled={running || phase !== 'idle'}
				onclick={runCheck}
				data-testid="asu-check">{t('asu.check')}</button
			>
		{/if}
	</div>
</Section>

{#if running || failed}
	<Section
		title={running ? t('asu.job_running') : t('asu.job_failed')}
		testid={running ? 'asu-job' : 'asu-job-failed'}
	>
		{#if running}<span class="loading loading-dots loading-sm" aria-hidden="true"></span>{/if}
		<!-- Scrollable region: focusable so keyboard users can scroll it. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<pre
			class="bg-base-200 max-h-64 overflow-auto rounded p-2 text-xs whitespace-pre-wrap"
			tabindex="0"
			aria-label={t('asu.job_running')}
			data-testid="asu-log">{st?.job.log ?? ''}</pre>
	</Section>
{/if}

{#if check && !running}
	<Section title={t('asu.result')} testid="asu-result">
		{#if check.to && check.from}
			<p class="text-sm">
				{check.to.version === check.from.version &&
				check.to.revision === check.from.revision
					? t('asu.no_newer', { version: check.from.version })
					: t('asu.upgrade_to', { from: check.from.version, to: check.to.version })}
			</p>
		{/if}
		{#each check.errors as e, i (i)}
			<div role="alert" class="alert alert-error text-sm">{e}</div>
		{/each}
		{#each check.warnings as w, i (i)}
			<div role="alert" class="alert alert-warning text-sm" data-testid="asu-warning">
				{w}
			</div>
		{/each}
		{#if check.missing.length}
			<p class="text-error text-sm">
				{t('asu.missing', { packages: check.missing.join(', ') })}
			</p>
		{/if}
		{#if check.changes.length}
			<details>
				<summary class="cursor-pointer text-sm"
					>{t('asu.changes', { count: check.changes.length })}</summary
				>
				<DataTable
					testid="asu-changes"
					rows={check.changes}
					rowKey={(c) => c.name}
					filter
					columns={[
						{ key: 'name', label: t('asu.col.package'), sortable: true },
						{ key: 'from', label: t('asu.col.from') },
						{ key: 'to', label: t('asu.col.to') },
					]}
				/>
			</details>
		{/if}
		{#if canWrite && check.ok && check.to}
			{#if check.warnings.length}
				<label class="label cursor-pointer justify-start gap-2">
					<input
						type="checkbox"
						class="checkbox checkbox-sm"
						bind:checked={accepted}
						data-testid="asu-accept"
					/>
					<span class="text-sm">{t('asu.accept_warnings')}</span>
				</label>
			{/if}
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="btn btn-sm"
					disabled={phase !== 'idle' || (check.warnings.length > 0 && !accepted)}
					onclick={runDownload}
					data-testid="asu-download"
					>{t('asu.download', { version: check.to.version })}</button
				>
				{#if imageReady}
					<button
						type="button"
						class="btn btn-primary btn-sm"
						disabled={phase !== 'idle'}
						onclick={() => (confirmOpen = true)}
						data-testid="asu-install"
						>{t('asu.install', {
							version: st!.image!.version,
							size: formatBytes(st!.image!.size),
						})}</button
					>
				{/if}
			</div>
		{/if}
	</Section>
{/if}

{#if host.uci.isLoaded('attendedsysupgrade')}
	<Section title={t('asu.server')}>
		<TextField
			label={t('asu.server_url')}
			uci="attendedsysupgrade.server.url"
			description={t('asu.server_help')}
			placeholder="https://sysupgrade.openwrt.org"
			testid="asu-server"
		/>
	</Section>
{/if}

<Modal bind:open={confirmOpen} title={t('asu.confirm_title')} testid="asu-confirm">
	<p class="text-sm">{t('asu.confirm_text')}</p>
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (confirmOpen = false)}
			>{t('asu.cancel')}</button
		>
		<button type="button" class="btn btn-primary" onclick={install} data-testid="asu-confirm-go"
			>{t('asu.confirm_go')}</button
		>
	{/snippet}
</Modal>
