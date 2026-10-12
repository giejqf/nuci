<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Network → Devices: bridges, 802.1q VLANs and device options; physical status. -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { isRpcError, type DeviceStatus } from '@nuci/rpc';
	import {
		asList,
		DataTable,
		formatBytes,
		ListField,
		Page,
		Section,
		SectionList,
		Select,
		TextField,
		validators,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { rpc, uci } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	let status = $state<Record<string, DeviceStatus>>({});
	let error = $state('');

	const physical = $derived(
		Object.entries(status)
			.filter(
				([n, d]) =>
					n !== 'lo' &&
					(d.devtype === 'ethernet' || d.type === 'Network device') &&
					!n.includes('.'),
			)
			.map(([n]) => n)
			.sort(),
	);
	const rows = $derived(
		Object.entries(status)
			.filter(([n]) => n !== 'lo')
			.map(([name, d]) => ({
				name,
				type: String(d.devtype ?? d.type ?? ''),
				up: d.up,
				carrier: d.carrier,
				mac: String(d.macaddr ?? ''),
				mtu: Number(d.mtu ?? 0),
				speed: String(d.speed ?? ''),
				rx: Number(d.statistics?.rx_bytes ?? 0),
				tx: Number(d.statistics?.tx_bytes ?? 0),
			})),
	);
	const MAC = (v: string) =>
		v === '' || /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(v) ? null : 'network.mac_invalid';

	onMount(() => {
		uci.load('network').catch((e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)));
		const load = () =>
			rpc.network
				.devices()
				.then((d) => (status = d))
				.catch((e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)));
		void load();
		const timer = setInterval(
			() => document.visibilityState === 'visible' && void load(),
			5000,
		);
		return () => clearInterval(timer);
	});
</script>

<Page
	title={t('network.devices')}
	description={t('network.devices_help')}
	readonly={!session.canWriteUci('network')}
>
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	{#if uci.isLoaded('network')}
		<Section title={t('network.device_config')}>
			<SectionList
				config="network"
				type="device"
				testid="devices"
				addLabel={t('network.add_device')}
				editTitle={t('network.device_config')}
				defaults={{ type: 'bridge' }}
				columns={[
					{ option: 'name', label: t('network.device_name') },
					{
						option: 'type',
						label: t('network.device_type'),
						format: (v) =>
							v === '8021q'
								? t('network.vlan')
								: v === 'bridge'
									? t('network.bridge')
									: String(v ?? t('network.ethernet')),
					},
					{
						option: 'ports',
						label: t('network.ports'),
						format: (v, s) =>
							uci.get('network', s, 'type') === '8021q'
								? `${uci.get('network', s, 'ifname') ?? ''} · VLAN ${uci.get('network', s, 'vid') ?? ''}`
								: asList(v).join(' ') || '—',
					},
					{ option: 'mtu', label: t('network.mtu') },
				]}
			>
				{#snippet editor(s)}
					{@const kind = String(uci.get('network', s, 'type') ?? '')}
					<Select
						label={t('network.device_type')}
						uci="network.{s}.type"
						options={[
							{ value: 'bridge', label: t('network.bridge') },
							{ value: '8021q', label: t('network.vlan') },
						]}
						placeholder={t('network.ethernet')}
					/>
					<TextField
						label={t('network.device_name')}
						uci="network.{s}.name"
						validate={validators.all(validators.required, (v) =>
							/^[A-Za-z0-9_.-]{1,15}$/.test(v) ? null : 'network.device_name_invalid',
						)}
						testid="device-name"
					/>
					{#if kind === 'bridge'}
						<ListField
							label={t('network.ports')}
							uci="network.{s}.ports"
							options={physical.map((p) => ({ value: p, label: p }))}
							testid="device-ports"
						/>
						<TextField
							label={t('network.stp')}
							uci="network.{s}.stp"
							placeholder="0"
							validate={validators.integer(0, 1)}
						/>
					{:else if kind === '8021q'}
						<Select
							label={t('network.vlan_base')}
							uci="network.{s}.ifname"
							options={physical.map((p) => ({ value: p, label: p }))}
							placeholder="—"
						/>
						<TextField
							label={t('network.vlan_id')}
							uci="network.{s}.vid"
							validate={validators.all(
								validators.required,
								validators.integer(1, 4094),
							)}
						/>
					{/if}
					<TextField
						label={t('network.mtu')}
						uci="network.{s}.mtu"
						validate={validators.integer(576, 9200)}
						placeholder="1500"
					/>
					<TextField
						label={t('network.macaddr')}
						uci="network.{s}.macaddr"
						validate={MAC}
						placeholder="aa:bb:cc:dd:ee:ff"
					/>
				{/snippet}
			</SectionList>
		</Section>
	{/if}

	<Section title={t('network.device_status')}>
		<DataTable
			testid="device-status"
			{rows}
			rowKey={(r) => r.name}
			columns={[
				{ key: 'name', label: t('network.device_name'), sortable: true },
				{ key: 'type', label: t('network.device_type') },
				{ key: 'up', label: t('overview.col.status') },
				{ key: 'mac', label: t('network.macaddr') },
				{ key: 'mtu', label: t('network.mtu'), align: 'right' },
				{ key: 'rx', label: t('realtime.rx_total'), align: 'right', sortable: true },
				{ key: 'tx', label: t('realtime.tx_total'), align: 'right', sortable: true },
			]}
		>
			{#snippet cell(r, c)}
				{#if c.key === 'up'}
					<span
						class="badge badge-sm {r.up && r.carrier
							? 'badge-success'
							: r.up
								? 'badge-warning'
								: 'badge-ghost'}"
						>{r.up
							? r.carrier
								? t('network.link_up')
								: t('network.no_carrier')
							: t('overview.down')}</span
					>
				{:else if c.key === 'rx' || c.key === 'tx'}{formatBytes(r[c.key])}
				{:else if c.key === 'mac'}<span class="font-mono text-xs">{r.mac}</span>
				{:else}{r[c.key as 'name' | 'type' | 'mtu']}{/if}
			{/snippet}
		</DataTable>
	</Section>
</Page>
