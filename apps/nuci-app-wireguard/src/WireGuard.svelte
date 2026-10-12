<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Network → WireGuard: tunnels (netifd proto wireguard), their peers
	(wireguard_<iface> sections) and peer configuration export. Every change
	is staged in the host and applied from its apply bar with rollback.
-->
<script lang="ts">
	import { FileText, KeyRound, Plus, Trash2 } from '@lucide/svelte';
	import type { HostContext } from '@nuci/app-sdk';
	import { t } from '@nuci/i18n';
	import {
		asList,
		DataTable,
		DynamicList,
		formatBytes,
		formatDuration,
		getNuciContext,
		Modal,
		Section,
		SectionList,
		Select,
		TextField,
		Toggle,
		toasts,
		validators,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { endpoint, KEY_RE, networkOf, peerConfig } from './peer-config';
	import { wgApi, type TunnelStatus } from './api';
	import Qr from './Qr.svelte';

	let { host }: { host: HostContext } = $props();
	const ctx = getNuciContext();
	const uci = ctx.uci;

	const api = $derived(wgApi(host));

	let status = $state<Record<string, TunnelStatus>>({});
	let now = $state(Math.floor(Date.now() / 1000));
	let wanAddress = $state('');
	let error = $state('');
	/** netifd loads protocol handlers at start: wireguard may be installed but unknown. */
	let handlerMissing = $state(false);

	// New tunnel
	let adding = $state(false);
	let newName = $state('');
	let newPort = $state('51820');
	let newAddress = $state('10.9.0.1/24');
	let newZone = $state('lan');
	let newAllowWan = $state(true);
	let creating = $state(false);

	// Export
	let exporting = $state<{ iface: string; peer: string } | null>(null);
	let exportHost = $state('');
	let exportFull = $state(true);

	const writable = $derived(host.uci.canWrite('network'));
	const tunnels = $derived(
		uci.isLoaded('network')
			? uci.sections('network', 'interface').filter((s) => s.proto === 'wireguard')
			: [],
	);
	const zones = $derived(
		uci.isLoaded('firewall')
			? uci
					.sections('firewall', 'zone')
					.map((z) => String(z.name ?? ''))
					.filter(Boolean)
			: [],
	);
	const nameError = $derived(
		!newName
			? null
			: !/^[A-Za-z0-9_]{1,15}$/.test(newName)
				? 'wireguard.name_invalid'
				: uci.getSection('network', newName)
					? 'wireguard.name_exists'
					: null,
	);
	const keyValidator = (v: string) =>
		v === '' || KEY_RE.test(v) ? null : 'wireguard.key_invalid';

	async function refresh() {
		try {
			status = await api.status();
			now = Math.floor(Date.now() / 1000);
			error = '';
		} catch (e) {
			error = String((e as Error)?.message ?? e);
		}
	}

	onMount(() => {
		void host.uci.load('network', 'firewall');
		void refresh();
		void host
			.call<Record<string, unknown>>('network', 'get_proto_handlers')
			.then((h) => (handlerMissing = !('wireguard' in h)))
			.catch(() => {});
		void host
			.call<{ interface: { interface: string; 'ipv4-address'?: { address: string }[] }[] }>(
				'network.interface',
				'dump',
			)
			.then((d) => {
				wanAddress =
					d.interface.find((i) => i.interface === 'wan')?.['ipv4-address']?.[0]
						?.address ?? '';
			})
			.catch(() => {});
		const timer = setInterval(
			() => document.visibilityState === 'visible' && void refresh(),
			5000,
		);
		return () => clearInterval(timer);
	});

	function addToZone(zone: string, iface: string) {
		const z = uci.sections('firewall', 'zone').find((s) => s.name === zone);
		if (!z) return;
		const nets = asList(z.network as string | string[]);
		if (!nets.includes(iface)) uci.set('firewall', z['.name'], 'network', [...nets, iface]);
	}

	async function createTunnel() {
		if (!newName || nameError) return;
		creating = true;
		try {
			const keys = await api.genkey();
			uci.add('network', 'interface', newName, {
				proto: 'wireguard',
				private_key: keys.private_key,
				listen_port: newPort,
				addresses: [newAddress],
			});
			if (newZone) addToZone(newZone, newName);
			if (newAllowWan)
				uci.add('firewall', 'rule', undefined, {
					name: `Allow-WireGuard-${newName}`,
					src: 'wan',
					proto: 'udp',
					dest_port: newPort,
					target: 'ACCEPT',
				});
			adding = false;
			newName = '';
		} catch (e) {
			toasts.error(String((e as Error)?.message ?? e));
		} finally {
			creating = false;
		}
	}

	function removeTunnel(name: string) {
		for (const p of uci.sections('network', `wireguard_${name}`))
			uci.remove('network', p['.name']);
		uci.remove('network', name);
		for (const z of uci.sections('firewall', 'zone')) {
			const nets = asList(z.network as string | string[]);
			if (nets.includes(name))
				uci.set(
					'firewall',
					z['.name'],
					'network',
					nets.filter((n) => n !== name),
				);
		}
		for (const r of uci.sections('firewall', 'rule'))
			if (r.name === `Allow-WireGuard-${name}`) uci.remove('firewall', r['.name']);
	}

	async function generatePeerKeys(section: string) {
		try {
			const k = await api.genkey();
			uci.set('network', section, 'private_key', k.private_key);
			uci.set('network', section, 'public_key', k.public_key);
		} catch (e) {
			toasts.error(String((e as Error)?.message ?? e));
		}
	}

	async function generatePsk(section: string) {
		try {
			const k = await api.genpsk();
			uci.set('network', section, 'preshared_key', k.preshared_key);
		} catch (e) {
			toasts.error(String((e as Error)?.message ?? e));
		}
	}

	const peerStatus = (iface: string, pub: unknown) =>
		status[iface]?.peers.find((p) => p.public_key === pub);

	const exportText = $derived.by(() => {
		if (!exporting) return '';
		const peer = uci.getSection('network', exporting.peer);
		const iface = uci.getSection('network', exporting.iface);
		const serverKey = status[exporting.iface]?.public_key ?? '';
		if (!peer || !iface || !peer.private_key || !serverKey) return '';
		const port = String(iface.listen_port ?? '51820');
		const ifaceAddrs = asList(iface.addresses as string | string[]);
		return peerConfig({
			privateKey: String(peer.private_key),
			addresses: asList(peer.allowed_ips as string | string[]),
			dns: ifaceAddrs
				.map((a) => a.split('/')[0] ?? '')
				.filter(Boolean)
				.slice(0, 1),
			serverPublicKey: serverKey,
			presharedKey: peer.preshared_key ? String(peer.preshared_key) : undefined,
			endpoint: endpoint(exportHost || wanAddress || 'router.example.net', port),
			allowedIps: exportFull ? ['0.0.0.0/0', '::/0'] : ifaceAddrs.map(networkOf),
			keepalive: 25,
		});
	});
</script>

{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
{#if handlerMissing}
	<div role="alert" class="alert alert-warning" data-testid="wg-no-handler">
		{t('wireguard.no_handler')}
	</div>
{/if}

<Section title={t('wireguard.tunnels')} description={t('wireguard.help')}>
	{#if writable}
		<div>
			<button
				type="button"
				class="btn btn-sm"
				onclick={() => (adding = true)}
				data-testid="wg-add"
			>
				<Plus size={16} aria-hidden="true" />{t('wireguard.add_tunnel')}
			</button>
		</div>
	{/if}
	{#if uci.isLoaded('network') && tunnels.length === 0}
		<p class="text-base-content/70 text-sm">{t('wireguard.none')}</p>
	{/if}
</Section>

{#each tunnels as tun (tun['.name'])}
	{@const name = tun['.name']}
	{@const st = status[name]}
	<Section title={name.toUpperCase()} testid="wg-tunnel-{name}">
		<dl class="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
			<dt class="text-base-content/70">{t('wireguard.public_key')}</dt>
			<dd class="font-mono text-xs break-all" data-testid="wg-{name}-pubkey">
				{st?.public_key ?? t('wireguard.not_running')}
			</dd>
			<dt class="text-base-content/70">{t('wireguard.listen_port')}</dt>
			<dd>{tun.listen_port ?? '—'}</dd>
			<dt class="text-base-content/70">{t('wireguard.addresses')}</dt>
			<dd class="font-mono text-xs">
				{asList(tun.addresses as string | string[]).join(', ') || '—'}
			</dd>
		</dl>

		<SectionList
			config="network"
			type="wireguard_{name}"
			testid="wg-{name}-peers"
			addLabel={t('wireguard.add_peer')}
			editTitle={t('wireguard.peer')}
			defaults={{ route_allowed_ips: '1', persistent_keepalive: '25' }}
			columns={[
				{ option: 'description', label: t('wireguard.description') },
				{
					option: 'allowed_ips',
					label: t('wireguard.allowed_ips'),
					format: (v) => asList(v).join(', '),
				},
				{
					option: 'public_key',
					label: t('wireguard.handshake'),
					format: (v) => {
						const p = peerStatus(name, v);
						return p?.latest_handshake
							? t('wireguard.ago', {
									time: formatDuration(Math.max(0, now - p.latest_handshake)),
								})
							: t('wireguard.never');
					},
				},
			]}
		>
			{#snippet editor(s)}
				<TextField
					label={t('wireguard.description')}
					uci="network.{s}.description"
					testid="wg-peer-description"
				/>
				<TextField
					label={t('wireguard.peer_public_key')}
					uci="network.{s}.public_key"
					validate={validators.all(validators.required, keyValidator)}
					description={t('wireguard.peer_public_key_help')}
					testid="wg-peer-pubkey"
				/>
				{#if writable}
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="btn btn-sm"
							onclick={() => generatePeerKeys(s)}
							data-testid="wg-peer-genkey"
							><KeyRound size={16} aria-hidden="true" />{t(
								'wireguard.generate_keys',
							)}</button
						>
						<button
							type="button"
							class="btn btn-sm"
							onclick={() => generatePsk(s)}
							data-testid="wg-peer-genpsk"
							><KeyRound size={16} aria-hidden="true" />{t(
								'wireguard.generate_psk',
							)}</button
						>
					</div>
				{/if}
				<DynamicList
					label={t('wireguard.allowed_ips')}
					uci="network.{s}.allowed_ips"
					validate={validators.ipOrCidr}
					description={t('wireguard.allowed_ips_help')}
					testid="wg-peer-allowed"
				/>
				<Toggle
					label={t('wireguard.route_allowed_ips')}
					uci="network.{s}.route_allowed_ips"
					default={false}
				/>
				<TextField
					label={t('wireguard.endpoint_host')}
					uci="network.{s}.endpoint_host"
					description={t('wireguard.endpoint_help')}
					testid="wg-peer-endpoint-host"
				/>
				<TextField
					label={t('wireguard.endpoint_port')}
					uci="network.{s}.endpoint_port"
					validate={validators.port}
					testid="wg-peer-endpoint-port"
				/>
				<TextField
					label={t('wireguard.keepalive')}
					uci="network.{s}.persistent_keepalive"
					validate={validators.integer(0, 65535)}
				/>
			{/snippet}
		</SectionList>

		{#if st?.peers.length}
			<DataTable
				testid="wg-{name}-status"
				caption={t('wireguard.peer_status')}
				rows={st.peers}
				rowKey={(p) => p.public_key}
				columns={[
					{ key: 'peer', label: t('wireguard.peer') },
					{ key: 'endpoint', label: t('wireguard.endpoint') },
					{ key: 'handshake', label: t('wireguard.handshake') },
					{ key: 'rx', label: t('wireguard.received'), align: 'right' },
					{ key: 'tx', label: t('wireguard.sent'), align: 'right' },
					{ key: 'export', label: t('wireguard.export') },
				]}
			>
				{#snippet cell(p, c)}
					{@const section = uci
						.sections('network', `wireguard_${name}`)
						.find((x) => x.public_key === p.public_key)}
					{#if c.key === 'peer'}{section?.description ?? `${p.public_key.slice(0, 8)}…`}
					{:else if c.key === 'endpoint'}<span class="font-mono text-xs"
							>{p.endpoint ?? '—'}</span
						>
					{:else if c.key === 'handshake'}
						<span data-testid="wg-handshake"
							>{p.latest_handshake
								? t('wireguard.ago', {
										time: formatDuration(Math.max(0, now - p.latest_handshake)),
									})
								: t('wireguard.never')}</span
						>
					{:else if c.key === 'rx'}{formatBytes(p.rx_bytes)}
					{:else if c.key === 'tx'}{formatBytes(p.tx_bytes)}
					{:else if c.key === 'export' && section?.private_key}
						<button
							type="button"
							class="btn btn-ghost btn-xs"
							aria-label={t('wireguard.export_of', {
								name: String(section.description ?? ''),
							})}
							onclick={() => (exporting = { iface: name, peer: section['.name'] })}
							><FileText size={14} aria-hidden="true" /></button
						>
					{/if}
				{/snippet}
			</DataTable>
		{/if}

		{#if writable}
			<div>
				<button
					type="button"
					class="btn btn-ghost btn-sm text-error"
					onclick={() => removeTunnel(name)}
					aria-label={t('wireguard.delete_tunnel', { name })}
					><Trash2 size={16} aria-hidden="true" />{t('wireguard.delete_tunnel', {
						name,
					})}</button
				>
			</div>
		{/if}
	</Section>
{/each}

<Modal bind:open={adding} title={t('wireguard.add_tunnel')} testid="wg-add-modal">
	<TextField
		label={t('wireguard.name')}
		bind:value={newName}
		validate={() => nameError}
		testid="wg-new-name"
	/>
	<TextField
		label={t('wireguard.listen_port')}
		bind:value={newPort}
		validate={validators.all(validators.required, validators.port)}
		testid="wg-new-port"
	/>
	<TextField
		label={t('wireguard.tunnel_address')}
		bind:value={newAddress}
		validate={validators.all(validators.required, validators.cidr4)}
		description={t('wireguard.tunnel_address_help')}
		testid="wg-new-address"
	/>
	<Select
		label={t('wireguard.zone')}
		bind:value={newZone}
		options={[
			{ value: '', label: t('wireguard.no_zone') },
			...zones.map((z) => ({ value: z, label: z })),
		]}
		description={t('wireguard.zone_help')}
	/>
	<Toggle
		label={t('wireguard.allow_wan')}
		bind:checked={newAllowWan}
		description={t('wireguard.allow_wan_help')}
	/>
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (adding = false)}
			>{t('ui.cancel')}</button
		>
		<button
			type="button"
			class="btn btn-primary"
			disabled={!newName || !!nameError || creating}
			onclick={createTunnel}
			data-testid="wg-new-create">{t('wireguard.create')}</button
		>
	{/snippet}
</Modal>

<Modal
	open={exporting !== null}
	title={t('wireguard.export')}
	onclose={() => (exporting = null)}
	testid="wg-export"
>
	<TextField
		label={t('wireguard.export_endpoint')}
		bind:value={exportHost}
		placeholder={wanAddress || 'vpn.example.net'}
		description={t('wireguard.export_endpoint_help')}
	/>
	<Toggle
		label={t('wireguard.export_full')}
		bind:checked={exportFull}
		description={t('wireguard.export_full_help')}
	/>
	{#if exportText}
		<div class="flex flex-col items-center gap-3 md:flex-row md:items-start">
			<Qr text={exportText} label={t('wireguard.qr_label')} />
			<textarea
				class="textarea h-64 w-full font-mono text-xs"
				readonly
				aria-label={t('wireguard.config_text')}
				value={exportText}
				data-testid="wg-config"></textarea>
		</div>
	{:else}
		<p class="text-sm">{t('wireguard.export_unavailable')}</p>
	{/if}
	{#snippet actions()}
		<button type="button" class="btn" onclick={() => (exporting = null)}>{t('ui.close')}</button
		>
	{/snippet}
</Modal>
