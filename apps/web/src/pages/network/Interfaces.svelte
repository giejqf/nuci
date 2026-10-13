<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Network → Interfaces: logical interfaces with live status. -->
<script lang="ts">
	import { Pencil, Plus, Power, RotateCw, Trash2 } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { isRpcError, type InterfaceStatus } from '@nuci/rpc';
	import {
		formatDuration,
		Modal,
		Page,
		Section,
		Select,
		TextField,
		toasts,
		poll,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { setZone, zoneOf, zones } from '../../lib/firewall';
	import { rpc, uci } from '../../lib/services';
	import { session } from '../../lib/session.svelte';
	import { router } from '../../router/router.svelte';
	import { availableProtos, proto } from './proto-registry';

	let status = $state<Record<string, InterfaceStatus>>({});
	let error = $state('');
	let adding = $state(false);
	let newName = $state('');
	let newProto = $state('static');
	let newDevice = $state('');
	let newZone = $state('');
	let confirmDelete = $state<string | null>(null);
	let devStatus = $state<Record<string, unknown>>({});
	let handlers = $state<Record<string, unknown> | null>(null);
	// Protocol handlers installed since netifd started: usable after a restart.
	let pending = $state<string[]>([]);
	let netifdStarted = $state<number | null>(null);
	let confirmRestart = $state(false);
	let restarting = $state(false);

	const writable = $derived(session.canWriteUci('network'));
	const canRestart = $derived(session.acl.canCall('nuci.network', 'restart'));
	const ifaces = $derived(
		uci.sections('network', 'interface').filter((s) => s['.name'] !== 'loopback'),
	);
	const devices = $derived(
		[
			...uci
				.sections('network', 'device')
				.map((d) => String(d.name ?? ''))
				.filter(Boolean),
			...Object.keys(devStatus).filter((d) => d !== 'lo'),
		]
			.filter((d, i, a) => a.indexOf(d) === i)
			.sort(),
	);
	const nameError = $derived(
		!newName
			? null
			: !/^[A-Za-z0-9_]{1,15}$/.test(newName)
				? 'network.iface_name_invalid'
				: uci.getSection('network', newName)
					? 'network.iface_exists'
					: null,
	);

	async function refresh() {
		try {
			const [dump, devs] = await Promise.all([
				rpc.network.interfaces(),
				rpc.network.devices(),
			]);
			status = Object.fromEntries(dump.map((i) => [i.interface, i]));
			devStatus = devs;
			error = '';
		} catch (e) {
			error = isRpcError(e) ? t(e.messageKey) : String(e);
		}
	}

	onMount(() => {
		uci.load('network', 'firewall', 'dhcp').catch(
			(e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)),
		);
		void loadProtocols();
		return poll(refresh, 5000);
	});

	async function loadProtocols() {
		const [h, p] = await Promise.all([
			rpc.network.protoHandlers().catch(() => null),
			rpc.nuci.network.protocols().catch(() => null),
		]);
		if (h) handlers = h;
		pending = p?.pending ?? [];
		netifdStarted = p?.started ?? null;
	}

	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	// All interfaces go down and up: wait until netifd runs again (a new start
	// time), retrying while the router is unreachable, then reload the handlers.
	async function restartNetwork() {
		confirmRestart = false;
		restarting = true;
		const before = netifdStarted;
		try {
			await rpc.nuci.network.restart();
			const until = Date.now() + 120_000;
			while (Date.now() < until) {
				await sleep(2000);
				const p = await rpc.nuci.network.protocols().catch(() => null);
				if (p && !p.job.running && p.started !== null && p.started !== before) break;
			}
			await loadProtocols();
			await refresh();
			toasts.success(t('network.service_restarted'));
		} catch (e) {
			toasts.error(isRpcError(e) ? t(e.messageKey) : String(e));
		} finally {
			restarting = false;
		}
	}

	async function act(name: string, what: 'up' | 'down') {
		try {
			await rpc.network[what](name);
			toasts.success(t(what === 'up' ? 'network.restarted' : 'network.stopped', { name }));
			setTimeout(refresh, 1500);
		} catch (e) {
			toasts.error(isRpcError(e) ? t(e.messageKey) : String(e));
		}
	}

	function create() {
		if (!newName || nameError) return;
		uci.add('network', 'interface', newName, {
			proto: newProto,
			...(newDevice && !proto(newProto)?.noDevice ? { device: newDevice } : {}),
		});
		if (newZone) setZone(uci, newName, newZone);
		adding = false;
		router.navigate(`network/interfaces/${newName}`);
		newName = '';
	}

	function remove(name: string) {
		uci.remove('network', name);
		setZone(uci, name, null);
		for (const d of uci.sections('dhcp', 'dhcp'))
			if (d.interface === name) uci.remove('dhcp', d['.name']);
		confirmDelete = null;
	}

	const addrs = (s?: InterfaceStatus) =>
		[...(s?.['ipv4-address'] ?? []), ...(s?.['ipv6-address'] ?? [])].map(
			(a) => `${a.address}/${a.mask}`,
		);
</script>

<Page
	title={t('network.interfaces')}
	description={t('network.interfaces_help')}
	readonly={!writable}
>
	{#snippet actions()}
		{#if writable}
			<button
				type="button"
				class="btn btn-sm"
				onclick={() => (adding = true)}
				data-testid="iface-add"
			>
				<Plus size={16} aria-hidden="true" />{t('network.add_iface')}
			</button>
		{/if}
	{/snippet}
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	{#if restarting}
		<div
			role="status"
			aria-live="polite"
			class="alert alert-info"
			data-testid="iface-restarting"
		>
			<span class="loading loading-spinner" aria-hidden="true"></span>
			{t('network.service_restarting')}
		</div>
	{:else if pending.length}
		<div role="status" class="alert alert-info" data-testid="iface-proto-pending">
			<span>{t('network.proto_pending', { protos: pending.join(', ') })}</span>
			{#if canRestart}
				<button
					type="button"
					class="btn btn-sm"
					onclick={() => (confirmRestart = true)}
					data-testid="iface-restart-network"
					><RotateCw size={16} aria-hidden="true" />{t('network.restart_service')}</button
				>
			{/if}
		</div>
	{/if}
	{#if uci.isLoaded('network')}
		<div class="grid gap-4 lg:grid-cols-2" data-testid="iface-list">
			{#each ifaces as i (i['.name'])}
				{@const name = i['.name']}
				{@const st = status[name]}
				{@const zone = uci.isLoaded('firewall') ? zoneOf(uci, name) : null}
				<Section title={name.toUpperCase()} testid="iface-{name}">
					{#snippet actions()}
						<span
							class="badge {st?.up
								? 'badge-success'
								: st
									? 'badge-error'
									: 'badge-ghost'}"
						>
							{st?.up
								? t('overview.up')
								: st
									? t('overview.down')
									: t('network.not_applied')}
						</span>
						{#if zone}<span class="badge badge-outline"
								>{t('network.zone', { zone })}</span
							>{/if}
					{/snippet}
					<dl class="text-sm">
						<div class="flex justify-between gap-4">
							<dt class="text-base-content/70">{t('network.protocol')}</dt>
							<dd>{t(proto(String(i.proto))?.label ?? String(i.proto))}</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-base-content/70">{t('network.device')}</dt>
							<dd class="font-mono">{st?.l3_device ?? i.device ?? '—'}</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-base-content/70">{t('network.addresses')}</dt>
							<dd
								class="font-mono text-xs break-all text-right"
								data-testid="iface-{name}-addrs"
							>
								{addrs(st).join(', ') || '—'}
							</dd>
						</div>
						{#if st?.up}<div class="flex justify-between gap-4">
								<dt class="text-base-content/70">{t('overview.uptime')}</dt>
								<dd>{formatDuration(st.uptime)}</dd>
							</div>{/if}
						{#if st?.errors?.length}<div role="alert" class="text-error text-xs">
								{st.errors.map((e) => e.code).join(', ')}
							</div>{/if}
					</dl>
					<div class="flex flex-wrap gap-1">
						<a
							class="btn btn-sm"
							href="#/network/interfaces/{name}"
							data-testid="iface-{name}-edit"
							><Pencil size={14} aria-hidden="true" />{t('ui.edit')}</a
						>
						{#if writable && st}
							<button
								type="button"
								class="btn btn-sm btn-ghost"
								onclick={() => act(name, 'up')}
								><RotateCw size={14} aria-hidden="true" />{t(
									'network.restart',
								)}</button
							>
							<button
								type="button"
								class="btn btn-sm btn-ghost"
								onclick={() => act(name, 'down')}
								><Power size={14} aria-hidden="true" />{t('network.stop')}</button
							>
						{/if}
						{#if writable}
							<button
								type="button"
								class="btn btn-sm btn-ghost text-error"
								onclick={() => (confirmDelete = name)}
								aria-label={t('ui.delete_entry', { name })}
								><Trash2 size={14} aria-hidden="true" /></button
							>
						{/if}
					</div>
				</Section>
			{/each}
		</div>
	{/if}
</Page>

<Modal bind:open={adding} title={t('network.add_iface')} testid="iface-add-modal">
	<TextField
		label={t('network.iface_name')}
		bind:value={newName}
		validate={() => nameError}
		testid="new-iface-name"
	/>
	<Select
		label={t('network.protocol')}
		bind:value={newProto}
		options={availableProtos(handlers).map((p) => ({ value: p.id, label: t(p.label) }))}
		testid="new-iface-proto"
	/>
	{#if !proto(newProto)?.noDevice}<Select
			label={t('network.device')}
			bind:value={newDevice}
			options={[
				{ value: '', label: t('network.no_device') },
				...devices.map((d) => ({ value: d, label: d })),
			]}
		/>{/if}
	<Select
		label={t('network.firewall_zone')}
		bind:value={newZone}
		options={[
			{ value: '', label: t('network.no_zone') },
			...zones(uci).map((z) => ({ value: z.name, label: z.name })),
		]}
	/>
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (adding = false)}
			>{t('ui.cancel')}</button
		>
		<button
			type="button"
			class="btn btn-primary"
			disabled={!newName || !!nameError}
			onclick={create}
			data-testid="new-iface-create">{t('network.create')}</button
		>
	{/snippet}
</Modal>

<Modal
	open={confirmDelete !== null}
	title={t('network.delete_iface')}
	onclose={() => (confirmDelete = null)}
>
	<p>{t('network.delete_iface_confirm', { name: confirmDelete ?? '' })}</p>
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (confirmDelete = null)}
			>{t('ui.cancel')}</button
		>
		<button
			type="button"
			class="btn btn-error"
			onclick={() => confirmDelete && remove(confirmDelete)}>{t('ui.delete')}</button
		>
	{/snippet}
</Modal>

<Modal
	bind:open={confirmRestart}
	title={t('network.restart_service')}
	testid="iface-restart-confirm"
>
	<p>{t('network.restart_service_confirm')}</p>
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (confirmRestart = false)}
			>{t('ui.cancel')}</button
		>
		<button
			type="button"
			class="btn btn-primary"
			onclick={restartNetwork}
			data-testid="iface-restart-go">{t('network.restart_service')}</button
		>
	{/snippet}
</Modal>
