<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Network → Wireless: radios, wireless networks, scan + join, associated stations. -->
<script lang="ts">
	import { Eye, Pencil, Plus, Radar, Settings2, Trash2 } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { isRpcError, type ScanResult, type WifiStation, type WirelessRadio } from '@nuci/rpc';
	import {
		DataTable,
		Form,
		formatDuration,
		Modal,
		Page,
		Section,
		Select,
		TextField,
		Toggle,
		toasts,
		validators,
		poll,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { setZone, zoneOf, zones } from '../../lib/firewall';
	import { rpc, uci } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	let status = $state<Record<string, WirelessRadio>>({});
	let stations = $state<WifiStation[]>([]);
	let error = $state('');
	let radioEdit = $state<string | null>(null);
	let ifaceEdit = $state<{ name: string; isNew: boolean } | null>(null);
	let scanRadio = $state<string | null>(null);
	let scanning = $state(false);
	let results = $state<ScanResult[]>([]);
	let join = $state<{ radio: string; ssid: string; bssid: string; encryption: string } | null>(
		null,
	);
	let joinKey = $state('');
	let joinNet = $state('wwan');
	let joinZone = $state('wan');
	let valid = $state(true);

	const writable = $derived(session.canWriteUci('wireless'));
	const radios = $derived(uci.sections('wireless', 'wifi-device'));
	const ifacesOf = (radio: string) =>
		uci.sections('wireless', 'wifi-iface').filter((i) => i.device === radio);
	const networks = $derived(
		uci
			.sections('network', 'interface')
			.map((i) => i['.name'])
			.filter((n) => n !== 'loopback'),
	);
	const CHANNELS: Record<string, number[]> = {
		'2g': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
		'5g': [
			36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140,
			144, 149, 153, 157, 161, 165,
		],
		'6g': Array.from({ length: 59 }, (_, i) => 1 + i * 4),
	};
	const HTMODES = [
		'HT20',
		'HT40',
		'VHT20',
		'VHT40',
		'VHT80',
		'VHT160',
		'HE20',
		'HE40',
		'HE80',
		'HE160',
		'EHT20',
		'EHT40',
		'EHT80',
		'EHT160',
		'EHT320',
	];
	const ENCRYPTION = ['none', 'psk2', 'psk-mixed', 'sae', 'sae-mixed', 'owe'];
	const needsKey = (enc: unknown) => /^(psk|sae)/.test(String(enc ?? 'none'));
	const keyValid = (enc: unknown) => (v: string) =>
		!needsKey(enc) ? null : v.length < 8 || v.length > 63 ? 'wireless.key_invalid' : null;

	async function refresh() {
		try {
			const [st, sta] = await Promise.all([
				rpc.network.wireless(),
				rpc.nuci.wifi.stations().catch(() => []),
			]);
			status = st;
			stations = sta;
		} catch (e) {
			error = isRpcError(e) ? t(e.messageKey) : String(e);
		}
	}

	onMount(() => {
		uci.load('wireless', 'network', 'firewall').catch(
			(e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)),
		);
		return poll(refresh, 5000);
	});

	function addIface(radio: string) {
		const name = uci.add('wireless', 'wifi-iface', undefined, {
			device: radio,
			mode: 'ap',
			ssid: 'OpenWrt',
			network: 'lan',
			encryption: 'psk2',
		});
		ifaceEdit = { name, isNew: true };
	}

	function closeIface(cancel: boolean) {
		if (cancel && ifaceEdit?.isNew) uci.remove('wireless', ifaceEdit.name);
		ifaceEdit = null;
	}

	async function scan(radio: string) {
		scanRadio = radio;
		scanning = true;
		results = [];
		try {
			results = (await rpc.nuci.wifi.scan(radio)).sort(
				(a, b) => (b.signal ?? -999) - (a.signal ?? -999),
			);
		} catch (e) {
			toasts.error(isRpcError(e) ? t(e.messageKey) : String(e));
		} finally {
			scanning = false;
		}
	}

	function encOf(r: ScanResult): string {
		const e = r.encryption;
		if (!e?.enabled) return 'none';
		const auth = e.authentication ?? [];
		if (auth.includes('sae')) return 'sae';
		if (auth.includes('owe')) return 'owe';
		if (auth.includes('psk')) return (e.wpa ?? []).includes(2) ? 'psk2' : 'psk';
		return 'unsupported';
	}

	function startJoin(r: ScanResult) {
		join = { radio: scanRadio!, ssid: r.ssid ?? '', bssid: r.bssid, encryption: encOf(r) };
		joinKey = '';
		scanRadio = null;
	}

	function doJoin() {
		if (!join) return;
		if (!uci.getSection('network', joinNet))
			uci.add('network', 'interface', joinNet, { proto: 'dhcp' });
		if (joinZone && zoneOf(uci, joinNet) !== joinZone) setZone(uci, joinNet, joinZone);
		uci.add('wireless', 'wifi-iface', undefined, {
			device: join.radio,
			mode: 'sta',
			network: joinNet,
			ssid: join.ssid,
			encryption: join.encryption,
			...(needsKey(join.encryption) ? { key: joinKey } : {}),
		});
		toasts.info(t('wireless.join_staged', { ssid: join.ssid }));
		join = null;
	}

	const radioStatus = (r: string) => status[r];
	const ifaceUp = (r: string, s: string) =>
		radioStatus(r)?.interfaces?.find((i) => i.section === s);
	const signal = (dbm?: number) => (dbm == null ? '—' : `${dbm} dBm`);
</script>

<Page title={t('wireless.title')} description={t('wireless.description')} readonly={!writable}>
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	{#if uci.isLoaded('wireless') && !radios.length}
		<Section
			><p class="text-base-content/60" data-testid="no-radios">
				{t('overview.no_wireless')}
			</p></Section
		>
	{/if}
	{#each radios as r (r['.name'])}
		{@const radio = r['.name']}
		{@const st = radioStatus(radio)}
		<Section title={radio} testid="radio-{radio}">
			{#snippet actions()}
				<span class="badge {st?.up ? 'badge-success' : 'badge-ghost'}"
					>{st?.up ? t('overview.up') : t('overview.down')}</span
				>
			{/snippet}
			<p class="text-sm">
				{t('wireless.summary', {
					band: String(r.band ?? '?'),
					channel: String(r.channel ?? 'auto'),
					htmode: String(r.htmode ?? '—'),
					country: String(r.country ?? '—'),
				})}
			</p>
			<div class="flex flex-wrap items-center gap-2">
				<Toggle
					label={t('wireless.radio_enabled')}
					uci="wireless.{radio}.disabled"
					on="0"
					off="1"
					default={true}
					testid="radio-{radio}-enabled"
				/>
				<button type="button" class="btn btn-sm" onclick={() => (radioEdit = radio)}
					><Settings2 size={14} aria-hidden="true" />{t('wireless.configure')}</button
				>
				<button
					type="button"
					class="btn btn-sm"
					onclick={() => scan(radio)}
					disabled={!session.acl.canCall('nuci.wifi', 'scan')}
					data-testid="radio-{radio}-scan"
					><Radar size={14} aria-hidden="true" />{t('wireless.scan')}</button
				>
				{#if writable}<button
						type="button"
						class="btn btn-sm"
						onclick={() => addIface(radio)}
						data-testid="radio-{radio}-add"
						><Plus size={14} aria-hidden="true" />{t('wireless.add_network')}</button
					>{/if}
			</div>
			<div class="overflow-x-auto">
				<table class="table-sm table" data-testid="radio-{radio}-ifaces">
					<thead
						><tr
							><th>{t('wireless.ssid')}</th><th>{t('wireless.mode')}</th><th
								>{t('network.network')}</th
							><th>{t('wireless.encryption')}</th><th>{t('overview.col.status')}</th
							><th><span class="sr-only">{t('ui.actions')}</span></th></tr
						></thead
					>
					<tbody>
						{#each ifacesOf(radio) as i (i['.name'])}
							{@const up = ifaceUp(radio, i['.name'])}
							<tr>
								<td class="font-medium">{i.ssid}</td>
								<td>{t(`wireless.modes.${i.mode ?? 'ap'}`)}</td>
								<td
									>{Array.isArray(i.network)
										? i.network.join(' ')
										: (i.network ?? '—')}</td
								>
								<td>{t(`wireless.enc.${i.encryption ?? 'none'}`)}</td>
								<td>
									{#if i.disabled === '1'}<span class="badge badge-ghost badge-sm"
											>{t('wireless.disabled')}</span
										>
									{:else if up?.ifname}<span
											class="badge badge-success badge-sm font-mono"
											>{up.ifname}</span
										>
									{:else}<span class="badge badge-ghost badge-sm"
											>{t('network.not_applied')}</span
										>{/if}
								</td>
								<td class="text-right whitespace-nowrap">
									<button
										type="button"
										class="btn btn-ghost btn-xs"
										aria-label={t(
											writable ? 'ui.edit_entry' : 'ui.view_entry',
											{
												name: String(i.ssid),
											},
										)}
										onclick={() =>
											(ifaceEdit = { name: i['.name'], isNew: false })}
										>{#if writable}<Pencil
												size={14}
												aria-hidden="true"
											/>{:else}<Eye
												size={14}
												aria-hidden="true"
											/>{/if}</button
									>
									{#if writable}<button
											type="button"
											class="btn btn-ghost btn-xs"
											aria-label={t('ui.delete_entry', {
												name: String(i.ssid),
											})}
											onclick={() => uci.remove('wireless', i['.name'])}
											><Trash2 size={14} aria-hidden="true" /></button
										>{/if}
								</td>
							</tr>
						{:else}
							<tr
								><td colspan="6" class="text-base-content/60 text-center"
									>{t('wireless.no_networks')}</td
								></tr
							>
						{/each}
					</tbody>
				</table>
			</div>
		</Section>
	{/each}

	<Section title={t('wireless.stations')}>
		<DataTable
			testid="stations"
			rows={stations}
			rowKey={(s) => `${s.device}-${s.mac}`}
			empty={t('wireless.no_stations')}
			columns={[
				{ key: 'hostname', label: t('overview.col.hostname'), sortable: true },
				{ key: 'mac', label: t('network.macaddr') },
				{ key: 'ssid', label: t('wireless.ssid') },
				{
					key: 'signal',
					label: t('realtime.signal_level'),
					align: 'right',
					sortable: true,
				},
				{ key: 'rate', label: t('realtime.bitrate'), align: 'right' },
				{ key: 'connected_time', label: t('wireless.connected'), align: 'right' },
			]}
		>
			{#snippet cell(s, c)}
				{#if c.key === 'hostname'}{s.hostname ?? (s.ipv4[0] || '—')}
				{:else if c.key === 'mac'}<span class="font-mono text-xs">{s.mac}</span>
				{:else if c.key === 'signal'}{signal(s.signal)}
				{:else if c.key === 'rate'}{s.rx_rate
						? `${(s.rx_rate / 1000).toFixed(1)} / ${((s.tx_rate ?? 0) / 1000).toFixed(1)} Mbit/s`
						: '—'}
				{:else if c.key === 'connected_time'}{formatDuration(s.connected_time)}
				{:else}{s.ssid ?? s.device}{/if}
			{/snippet}
		</DataTable>
	</Section>
</Page>

<Modal
	open={radioEdit !== null}
	title={t('wireless.configure_radio', { radio: radioEdit ?? '' })}
	onclose={() => (radioEdit = null)}
>
	{#if radioEdit}
		{@const band = String(uci.get('wireless', radioEdit, 'band') ?? '2g')}
		<Form bind:valid>
			<Select
				label={t('wireless.band')}
				uci="wireless.{radioEdit}.band"
				options={['2g', '5g', '6g'].map((b) => ({
					value: b,
					label: t(`wireless.bands.${b}`),
				}))}
			/>
			<Select
				label={t('wireless.channel')}
				uci="wireless.{radioEdit}.channel"
				options={[
					{ value: 'auto', label: t('wireless.auto') },
					...(CHANNELS[band] ?? []).map((c) => ({ value: String(c), label: String(c) })),
				]}
				testid="radio-channel"
			/>
			<Select
				label={t('wireless.htmode')}
				uci="wireless.{radioEdit}.htmode"
				options={HTMODES.map((h) => ({ value: h, label: h }))}
				placeholder={t('proto.default')}
			/>
			<TextField
				label={t('wireless.country')}
				uci="wireless.{radioEdit}.country"
				validate={(v) =>
					v === '' || /^[A-Z]{2}$/.test(v) ? null : 'wireless.country_invalid'}
				description={t('wireless.country_help')}
				placeholder="US"
			/>
			<TextField
				label={t('wireless.txpower')}
				uci="wireless.{radioEdit}.txpower"
				validate={validators.integer(0, 40)}
				placeholder={t('wireless.auto')}
			/>
		</Form>
	{/if}
	{#snippet actions()}
		<button
			type="button"
			class="btn btn-primary"
			disabled={!valid}
			onclick={() => (radioEdit = null)}>{t('ui.done')}</button
		>
	{/snippet}
</Modal>

<Modal
	open={ifaceEdit !== null}
	title={t('wireless.network')}
	onclose={() => closeIface(true)}
	testid="iface-editor"
>
	{#if ifaceEdit}
		{@const s = ifaceEdit.name}
		{@const enc = uci.get('wireless', s, 'encryption')}
		<Form bind:valid>
			<Select
				label={t('wireless.mode')}
				uci="wireless.{s}.mode"
				options={['ap', 'sta'].map((m) => ({ value: m, label: t(`wireless.modes.${m}`) }))}
				testid="wifi-mode"
			/>
			<TextField
				label={t('wireless.ssid')}
				uci="wireless.{s}.ssid"
				validate={(v) => (v.length < 1 || v.length > 32 ? 'wireless.ssid_invalid' : null)}
				testid="wifi-ssid"
			/>
			<Select
				label={t('network.network')}
				uci="wireless.{s}.network"
				options={[
					{ value: '', label: t('wireless.no_network') },
					...networks.map((n) => ({ value: n, label: n })),
				]}
				testid="wifi-network"
			/>
			<Select
				label={t('wireless.encryption')}
				uci="wireless.{s}.encryption"
				options={ENCRYPTION.map((e) => ({ value: e, label: t(`wireless.enc.${e}`) }))}
				testid="wifi-encryption"
			/>
			{#if needsKey(enc)}
				<TextField
					label={t('wireless.key')}
					uci="wireless.{s}.key"
					type="password"
					validate={keyValid(enc)}
					testid="wifi-key"
				/>
			{/if}
			<Toggle label={t('wireless.hidden')} uci="wireless.{s}.hidden" default={false} />
			<Toggle
				label={t('wireless.iface_enabled')}
				uci="wireless.{s}.disabled"
				on="0"
				off="1"
				default={true}
				testid="wifi-enabled"
			/>
		</Form>
	{/if}
	{#snippet actions()}
		{#if ifaceEdit?.isNew}<button
				type="button"
				class="btn btn-ghost"
				onclick={() => closeIface(true)}>{t('ui.cancel')}</button
			>{/if}
		<button
			type="button"
			class="btn btn-primary"
			disabled={!valid}
			onclick={() => closeIface(false)}
			data-testid="iface-editor-done">{t('ui.done')}</button
		>
	{/snippet}
</Modal>

<Modal
	open={scanRadio !== null}
	title={t('wireless.scan_title', { radio: scanRadio ?? '' })}
	onclose={() => (scanRadio = null)}
	testid="scan-modal"
>
	{#if scanning}
		<div class="flex justify-center p-6" role="status">
			<span class="loading loading-spinner" role="img" aria-label={t('wireless.scanning')}
			></span>
		</div>
	{:else if !results.length}
		<p class="text-base-content/60">{t('wireless.scan_empty')}</p>
	{:else}
		<table class="table-sm table" data-testid="scan-results">
			<thead
				><tr
					><th>{t('wireless.ssid')}</th><th>{t('wireless.channel')}</th><th
						>{t('realtime.signal_level')}</th
					><th>{t('wireless.encryption')}</th><th></th></tr
				></thead
			>
			<tbody>
				{#each results as r (r.bssid)}
					<tr>
						<td class="font-medium"
							>{r.ssid || t('wireless.hidden_ssid')}
							<div class="text-base-content/60 font-mono text-xs">{r.bssid}</div></td
						>
						<td>{r.channel ?? '—'}</td>
						<td>{signal(r.signal)}</td>
						<td>{t(`wireless.enc.${encOf(r)}`)}</td>
						<td
							>{#if writable && r.ssid && encOf(r) !== 'unsupported'}<button
									type="button"
									class="btn btn-xs btn-primary"
									onclick={() => startJoin(r)}
									aria-label={t('wireless.join_ssid', { ssid: r.ssid })}
									>{t('wireless.join')}</button
								>{/if}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
	{#snippet actions()}
		<button
			type="button"
			class="btn btn-ghost"
			disabled={scanning}
			onclick={() => scanRadio && scan(scanRadio)}>{t('wireless.rescan')}</button
		>
		<button type="button" class="btn" onclick={() => (scanRadio = null)}>{t('ui.close')}</button
		>
	{/snippet}
</Modal>

<Modal
	open={join !== null}
	title={t('wireless.join_title', { ssid: join?.ssid ?? '' })}
	onclose={() => (join = null)}
	testid="join-modal"
>
	{#if join}
		<Form bind:valid>
			{#if needsKey(join.encryption)}
				<TextField
					label={t('wireless.key')}
					type="password"
					bind:value={joinKey}
					validate={keyValid(join.encryption)}
					testid="join-key"
				/>
			{/if}
			<TextField
				label={t('wireless.join_network')}
				bind:value={joinNet}
				validate={(v) =>
					/^[A-Za-z0-9_]{1,15}$/.test(v) ? null : 'network.iface_name_invalid'}
				description={t('wireless.join_network_help')}
			/>
			<Select
				label={t('network.firewall_zone')}
				bind:value={joinZone}
				options={[
					{ value: '', label: t('network.no_zone') },
					...zones(uci).map((z) => ({ value: z.name, label: z.name })),
				]}
			/>
		</Form>
	{/if}
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (join = null)}
			>{t('ui.cancel')}</button
		>
		<button
			type="button"
			class="btn btn-primary"
			disabled={!valid || (join !== null && needsKey(join.encryption) && !joinKey)}
			onclick={doJoin}
			data-testid="join-submit">{t('wireless.join')}</button
		>
	{/snippet}
</Modal>
