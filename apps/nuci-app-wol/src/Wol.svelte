<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Services → Wake on LAN: wake a known host or any MAC address right away
	(nuci.wol wake), and saved devices from the etherwake config (staged in
	the host; "wake on boot" is etherwake's own init script).
-->
<script lang="ts">
	import { Power } from '@lucide/svelte';
	import type { HostContext } from '@nuci/app-sdk';
	import { t } from '@nuci/i18n';
	import {
		getNuciContext,
		Section,
		SectionList,
		Select,
		TextField,
		Toggle,
		toasts,
		validators,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import {
		macValidator,
		normalizeMac,
		passwordValidator,
		wolApi,
		type Iface,
		type KnownHost,
	} from './api';

	let { host }: { host: HostContext } = $props();
	const uci = getNuciContext().uci;
	const api = $derived(wolApi(host));

	let ifaces = $state<Iface[]>([]);
	let program = $state<string | null | undefined>(undefined);
	let hosts = $state<KnownHost[]>([]);
	let chosen = $state('');
	let mac = $state('');
	let iface = $state('');
	let broadcast = $state(false);
	let password = $state('');
	let busy = $state(false);

	const canWake = $derived(host.hasAccess('nuci-app-wol', 'write'));
	const loaded = $derived(uci.isLoaded('etherwake'));
	const setupIface = $derived(
		loaded ? String(uci.get('etherwake', 'setup', 'interface') ?? '') : '',
	);
	const setupBroadcast = $derived(
		loaded &&
			['1', 'on', 'true', 'yes'].includes(String(uci.get('etherwake', 'setup', 'broadcast'))),
	);
	// etherwake's own default is eth0; on OpenWrt the LAN is usually a bridge.
	const defaultIface = $derived(
		setupIface ||
			(ifaces.find((i) => i.name === 'br-lan') ?? ifaces.find((i) => i.bridge) ?? ifaces[0])
				?.name ||
			'',
	);
	const ifaceOptions = $derived(
		ifaces.map((i) => ({
			value: i.name,
			label: i.master ? t('wol.port_of', { name: i.name, bridge: i.master }) : i.name,
		})),
	);
	const hostOptions = $derived(
		hosts.map((h) => ({
			value: h.macaddr,
			label: [h.hostname, h.ipv4[0] ?? h.ipv6[0], h.macaddr].filter(Boolean).join(' · '),
		})),
	);
	const valid = $derived(
		!!normalizeMac(mac) && !passwordValidator(password) && !!(iface || defaultIface),
	);

	onMount(() => {
		void host.uci.load('etherwake');
		api.interfaces()
			.then((r) => {
				ifaces = r.interfaces;
				program = r.program;
			})
			.catch(() => (program = null));
		api.hosts()
			.then((r) => (hosts = r.hosts))
			.catch(() => {});
	});

	async function wake(target: { mac: string; password?: string; name?: string }) {
		busy = true;
		try {
			const r = await api.wake({
				mac: target.mac,
				interface: iface || defaultIface,
				broadcast: broadcast || setupBroadcast,
				...(target.password ? { password: target.password } : {}),
			});
			toasts.success(t('wol.sent', { name: target.name || r.mac, interface: r.interface }));
		} catch (e) {
			toasts.error(String((e as Error)?.message ?? e));
		} finally {
			busy = false;
		}
	}

	const saved = (s: string) => ({
		mac: String(uci.get('etherwake', s, 'mac') ?? ''),
		password: String(uci.get('etherwake', s, 'password') ?? ''),
		name: String(uci.get('etherwake', s, 'name') ?? ''),
	});
</script>

{#if program === null}
	<div role="alert" class="alert alert-warning" data-testid="wol-missing">
		{t('wol.no_program')}
	</div>
{/if}

<Section title={t('wol.wake_title')} description={t('wol.help')}>
	<Select
		label={t('wol.known_host')}
		options={hostOptions}
		bind:value={chosen}
		placeholder={t('wol.pick_host')}
		onchange={(v) => {
			if (v) mac = v;
		}}
		testid="wol-host"
	/>
	<TextField
		label={t('wol.mac')}
		bind:value={mac}
		validate={validators.all(validators.required, macValidator)}
		placeholder="aa:bb:cc:dd:ee:ff"
		testid="wol-mac"
	/>
	<Select
		label={t('wol.interface')}
		options={ifaceOptions}
		bind:value={iface}
		placeholder={defaultIface}
		description={t('wol.interface_help')}
		testid="wol-interface"
	/>
	<Toggle
		label={t('wol.broadcast')}
		bind:checked={broadcast}
		description={t('wol.broadcast_help')}
	/>
	<TextField
		label={t('wol.password')}
		bind:value={password}
		validate={passwordValidator}
		description={t('wol.password_help')}
		testid="wol-password"
	/>
	{#if canWake}
		<div>
			<button
				type="button"
				class="btn btn-primary btn-sm"
				disabled={busy || !valid || !program}
				onclick={() => wake({ mac: normalizeMac(mac)!, password })}
				data-testid="wol-wake"><Power size={16} aria-hidden="true" />{t('wol.wake')}</button
			>
		</div>
	{/if}
</Section>

{#if loaded}
	<Section title={t('wol.saved')} description={t('wol.saved_help')}>
		<SectionList
			config="etherwake"
			type="target"
			testid="wol-targets"
			addLabel={t('wol.add')}
			editTitle={t('wol.device')}
			defaults={{ wakeonboot: 'off' }}
			columns={[
				{ option: 'name', label: t('wol.name') },
				{ option: 'mac', label: t('wol.mac') },
				{
					option: 'wakeonboot',
					label: t('wol.on_boot'),
					format: (v) =>
						['1', 'on', 'true', 'yes'].includes(String(v)) ? t('wol.yes') : t('wol.no'),
				},
			]}
		>
			{#snippet rowActions(s)}
				{#if canWake}
					<button
						type="button"
						class="btn btn-ghost btn-xs"
						disabled={busy || !program || !normalizeMac(saved(s).mac)}
						aria-label={t('wol.wake_named', { name: saved(s).name || saved(s).mac })}
						onclick={() => wake({ ...saved(s), mac: normalizeMac(saved(s).mac)! })}
						data-testid="wol-target-wake"><Power size={14} aria-hidden="true" /></button
					>
				{/if}
			{/snippet}
			{#snippet editor(s)}
				<TextField
					label={t('wol.name')}
					uci="etherwake.{s}.name"
					validate={validators.required}
					testid="wol-target-name"
				/>
				<TextField
					label={t('wol.mac')}
					uci="etherwake.{s}.mac"
					validate={validators.all(validators.required, macValidator)}
					placeholder="aa:bb:cc:dd:ee:ff"
					testid="wol-target-mac"
				/>
				<TextField
					label={t('wol.password')}
					uci="etherwake.{s}.password"
					validate={passwordValidator}
					description={t('wol.password_help')}
				/>
				<Toggle
					label={t('wol.on_boot')}
					uci="etherwake.{s}.wakeonboot"
					on="on"
					off="off"
					description={t('wol.on_boot_help')}
				/>
			{/snippet}
		</SectionList>
	</Section>

	<Section title={t('wol.settings')}>
		<Select
			label={t('wol.default_interface')}
			uci="etherwake.setup.interface"
			options={ifaceOptions}
			placeholder={t('wol.auto')}
			description={t('wol.default_interface_help')}
			testid="wol-setup-interface"
		/>
		<Toggle
			label={t('wol.broadcast')}
			uci="etherwake.setup.broadcast"
			on="on"
			off="off"
			description={t('wol.broadcast_help')}
		/>
	</Section>
{/if}
