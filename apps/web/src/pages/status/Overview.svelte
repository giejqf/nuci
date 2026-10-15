<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Status → Overview: system, memory, storage, interfaces, wireless, DHCP leases. -->
<script lang="ts">
	import { CircleCheck, CircleAlert, RefreshCw } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import {
		isRpcError,
		type BoardInfo,
		type DhcpLease,
		type InterfaceStatus,
		type RealtimeStats,
		type SystemInfo,
		type WirelessRadio,
	} from '@nuci/rpc';
	import {
		DataTable,
		formatBytes,
		formatDateTime,
		formatDuration,
		formatPercent,
		formatRate,
		Meter,
		Page,
		Section,
		Stat,
		StatTile,
		poll,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { rpc } from '../../lib/services';

	type Key = 'board' | 'info' | 'interfaces' | 'wireless' | 'leases';

	let board = $state<BoardInfo | null>(null);
	let info = $state<SystemInfo | null>(null);
	let infoAt = 0;
	let stats = $state<RealtimeStats | null>(null);
	let cpu = $state<number | null>(null);
	let rates = $state<Record<string, { rx: number; tx: number }>>({});
	let ifaces = $state<InterfaceStatus[]>([]);
	let radios = $state<Record<string, WirelessRadio>>({});
	let leases = $state<DhcpLease[]>([]);
	let errors = $state<Partial<Record<Key, string>>>({});
	let loading = $state(true);
	let now = $state(Date.now());
	let prev: { s: RealtimeStats; at: number } | null = null;

	async function refresh() {
		const jobs: [Key, Promise<unknown>][] = [
			['board', rpc.system.board()],
			['info', rpc.system.info()],
			['interfaces', rpc.network.interfaces()],
			['wireless', rpc.network.wireless()],
			['leases', rpc.nuci.dhcp.leases()],
		];
		const results = await Promise.allSettled(jobs.map(([, p]) => p));
		const errs: Partial<Record<Key, string>> = {};
		results.forEach((r, i) => {
			const key = jobs[i]![0];
			if (r.status === 'rejected') {
				errs[key] = isRpcError(r.reason) ? t(r.reason.messageKey) : String(r.reason);
				return;
			}
			const v = r.value;
			if (key === 'board') board = v as BoardInfo;
			if (key === 'info') {
				info = v as SystemInfo;
				infoAt = Date.now();
			}
			if (key === 'interfaces')
				ifaces = (v as InterfaceStatus[]).filter((i) => i.interface !== 'loopback');
			if (key === 'wireless') radios = v as Record<string, WirelessRadio>;
			if (key === 'leases') leases = v as DhcpLease[];
		});
		errors = errs;
		loading = false;
	}

	function onStats(s: RealtimeStats) {
		const at = Date.now();
		if (prev) {
			const dt = (at - prev.at) / 1000;
			const c0 = prev.s.cpu;
			const c1 = s.cpu;
			if (c0 && c1) {
				const total = (o: typeof c1) =>
					o.user + o.nice + o.system + o.idle + o.iowait + o.irq + o.softirq + o.steal;
				const dTotal = total(c1) - total(c0);
				const dIdle = c1.idle + c1.iowait - (c0.idle + c0.iowait);
				cpu = dTotal > 0 ? Math.max(0, Math.min(1, 1 - dIdle / dTotal)) : cpu;
			}
			if (dt > 0) {
				const r: Record<string, { rx: number; tx: number }> = {};
				for (const [dev, c] of Object.entries(s.interfaces)) {
					const p = prev.s.interfaces[dev];
					if (p)
						r[dev] = {
							rx: Math.max(0, (c.rx_bytes - p.rx_bytes) / dt),
							tx: Math.max(0, (c.tx_bytes - p.tx_bytes) / dt),
						};
				}
				rates = r;
			}
		}
		prev = { s, at };
		stats = s;
		now = at;
	}

	onMount(() => {
		const stop = poll(refresh, 15_000);
		const off = rpc.events.subscribe('stats', onStats);
		return () => {
			stop();
			off();
		};
	});

	const memory = $derived.by(() => {
		if (stats) {
			const m = stats.memory;
			return { total: m.total, available: m.available, buffers: m.buffers, cached: m.cached };
		}
		if (info) {
			const m = info.memory;
			return {
				total: m.total,
				available: m.available ?? m.free,
				buffers: m.buffered,
				cached: m.cached ?? 0,
			};
		}
		return null;
	});
	const load = $derived(stats?.load ?? (info ? info.load.map((l) => l / 65536) : null));
	const uptime = $derived(stats?.uptime ?? info?.uptime ?? null);
	const localtime = $derived(info ? info.localtime + Math.round((now - infoAt) / 1000) : null);

	const ifaceRows = $derived(
		ifaces.map((i) => ({
			name: i.interface,
			proto: i.proto,
			up: i.up,
			device: i.l3_device ?? i.device ?? '',
			addrs: [...(i['ipv4-address'] ?? []), ...(i['ipv6-address'] ?? [])]
				.map((a) => `${a.address}/${a.mask}`)
				.join(', '),
			uptime: i.up ? (i.uptime ?? 0) : 0,
			rx: rates[i.l3_device ?? '']?.rx ?? null,
			tx: rates[i.l3_device ?? '']?.tx ?? null,
		})),
	);

	const leaseRows = $derived(
		leases.map((l) => ({
			hostname: l.hostname ?? '',
			address: l.address,
			id: l.macaddr ?? l.duid ?? '',
			expires: l.expires,
			family: l.family,
		})),
	);

	const wifi = $derived(
		Object.entries(radios).flatMap(([radio, r]) =>
			(r.interfaces ?? []).map((i) => ({
				radio,
				up: r.up,
				ifname: i.ifname ?? '',
				ssid: String(i.config?.ssid ?? ''),
				mode: String(i.config?.mode ?? ''),
			})),
		),
	);
	// Radios without an active network still exist; say so instead of "no devices".
	const idle = $derived(
		Object.entries(radios)
			.filter(([, r]) => !r.interfaces?.length)
			.map(([radio, r]) => ({
				radio,
				band: String(r.config?.band ?? ''),
				disabled: r.disabled,
			})),
	);

	// The internet connection: the "wan" interface (or the first with a default route).
	const wan = $derived(
		ifaces.find((i) => i.interface === 'wan') ??
			ifaces.find((i) => i.route?.some((r) => r.target === '0.0.0.0')),
	);
	const wanRate = $derived(wan ? rates[wan.l3_device ?? ''] : undefined);
	const wanAddr = $derived(
		wan?.['ipv4-address']?.[0]?.address ?? wan?.['ipv6-address']?.[0]?.address,
	);

	const pct = (used: number, total: number) => (total > 0 ? used / total : 0);
</script>

<Page title={t('overview.title')}>
	{#snippet actions()}
		<button
			type="button"
			class="btn btn-ghost btn-sm"
			onclick={() => refresh()}
			aria-label={t('overview.refresh')}
		>
			<RefreshCw size={16} aria-hidden="true" />{t('overview.refresh')}
		</button>
	{/snippet}

	{#if loading}
		<div class="flex justify-center p-8" role="status">
			<span class="loading loading-spinner" role="img" aria-label={t('ui.loading')}></span>
		</div>
	{:else}
		{#if wan}
			<div
				class="card bg-base-100 border-base-300 flex-row flex-wrap items-center gap-x-6 gap-y-4 border p-5"
				data-testid="overview-internet"
			>
				<span
					class="flex size-14 flex-none items-center justify-center rounded-full {wan.up
						? 'bg-success/15 text-success'
						: 'bg-error/15 text-error'}"
				>
					{#if wan.up}<CircleCheck size={28} aria-hidden="true" />{:else}<CircleAlert
							size={28}
							aria-hidden="true"
						/>{/if}
				</span>
				<div class="min-w-56 flex-1">
					<h2 class="text-2xl font-medium">
						{wan.up ? t('overview.internet_up') : t('overview.internet_down')}
					</h2>
					<p class="text-base-content/70 text-sm">
						{[
							t('overview.internet_via', {
								name: wan.interface.toUpperCase(),
								proto: wan.proto,
							}),
							wanAddr ? `${t('overview.internet_addr')} ${wanAddr}` : '',
							wan.up && wan.uptime
								? t('overview.internet_online', {
										duration: formatDuration(wan.uptime),
									})
								: '',
						]
							.filter(Boolean)
							.join(' · ')}
					</p>
				</div>
				<dl class="flex gap-8">
					<div>
						<dt class="text-base-content/70 text-xs tracking-wide uppercase">
							{t('overview.download')}
						</dt>
						<dd class="text-2xl font-medium tabular-nums">
							{formatRate(wanRate?.rx ?? null)}
						</dd>
					</div>
					<div>
						<dt class="text-base-content/70 text-xs tracking-wide uppercase">
							{t('overview.upload')}
						</dt>
						<dd class="text-2xl font-medium tabular-nums">
							{formatRate(wanRate?.tx ?? null)}
						</dd>
					</div>
				</dl>
			</div>
		{/if}

		<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
			<StatTile
				label={t('overview.devices')}
				value={String(leases.length)}
				caption={t('overview.devices_caption')}
			/>
			<StatTile
				label={t('overview.cpu')}
				value={cpu === null ? '—' : formatPercent(cpu)}
				bar={cpu}
				testid="overview-cpu"
			/>
			{#if memory}
				<StatTile
					label={t('overview.memory')}
					value={formatPercent(pct(memory.total - memory.available, memory.total))}
					bar={pct(memory.total - memory.available, memory.total)}
					caption="{formatBytes(memory.total - memory.available)} / {formatBytes(
						memory.total,
					)}"
					testid="overview-memory"
				/>
			{/if}
			<StatTile
				label={t('overview.uptime')}
				value={formatDuration(uptime)}
				caption={board?.release.description}
			/>
		</div>

		<div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
			<Section title={t('overview.system')} testid="overview-system">
				{#if errors.board}<p role="alert" class="text-error text-sm">{errors.board}</p>{/if}
				<dl>
					<Stat
						label={t('overview.hostname')}
						value={board?.hostname}
						testid="overview-hostname"
					/>
					<Stat
						label={t('overview.model')}
						value={board?.model}
						testid="overview-model"
					/>
					<Stat
						label={t('overview.firmware')}
						value={board?.release.description}
						testid="overview-firmware"
					/>
					<Stat label={t('overview.kernel')} value={board?.kernel} />
					<Stat
						label={t('overview.localtime')}
						value={formatDateTime(localtime)}
						testid="overview-localtime"
					/>
					<Stat
						label={t('overview.uptime')}
						value={formatDuration(uptime)}
						testid="overview-uptime"
					/>
					<Stat
						label={t('overview.load')}
						value={load ? load.map((l) => l.toFixed(2)).join(' · ') : null}
						testid="overview-load"
					/>
				</dl>
			</Section>

			<Section title={t('overview.resources')} testid="overview-resources">
				<dl>
					{#if info?.root}
						<Meter
							label={t('overview.storage_root')}
							value={pct(info.root.used, info.root.total)}
							text="{formatBytes(info.root.used * 1024)} / {formatBytes(
								info.root.total * 1024,
							)}"
							tone="accent"
						/>
					{/if}
					{#if info?.tmp}
						<Meter
							label={t('overview.storage_tmp')}
							value={pct(info.tmp.used, info.tmp.total)}
							text="{formatBytes(info.tmp.used * 1024)} / {formatBytes(
								info.tmp.total * 1024,
							)}"
							tone="neutral"
						/>
					{/if}
					{#if memory}
						<Stat
							label={t('overview.memory_cached')}
							value="{formatBytes(memory.cached)} · {formatBytes(memory.buffers)}"
						/>
					{/if}
					{#if stats}
						<Stat
							label={t('overview.connections')}
							value="{stats.conntrack.count} / {stats.conntrack.max}"
							testid="overview-conntrack"
						/>
					{/if}
				</dl>
			</Section>

			<Section title={t('overview.wireless')} testid="overview-wireless">
				{#if errors.wireless}
					<p role="alert" class="text-error text-sm">{errors.wireless}</p>
				{:else if !wifi.length && !idle.length}
					<p class="text-base-content/70 text-sm">{t('overview.no_wireless')}</p>
				{:else}
					<ul class="flex flex-col gap-1 text-sm">
						{#each wifi as w (w.radio + w.ifname)}
							<li class="flex justify-between gap-2">
								<span>{w.ssid || w.ifname}</span>
								<span
									class="badge badge-sm {w.up ? 'badge-success' : 'badge-ghost'}"
									>{w.radio} · {w.mode}</span
								>
							</li>
						{/each}
						{#each idle as r (r.radio)}
							<li
								class="flex justify-between gap-2"
								data-testid="overview-radio-idle"
							>
								<a class="link" href="#/network/wireless"
									>{r.band
										? `${r.radio} · ${t(`wireless.bands.${r.band}`)}`
										: r.radio}</a
								>
								<span class="badge badge-sm badge-ghost"
									>{t(
										r.disabled
											? 'overview.radio_disabled'
											: 'overview.radio_no_networks',
									)}</span
								>
							</li>
						{/each}
					</ul>
				{/if}
			</Section>
		</div>

		<Section title={t('overview.interfaces')}>
			{#if errors.interfaces}<p role="alert" class="text-error text-sm">
					{errors.interfaces}
				</p>{/if}
			<DataTable
				testid="overview-interfaces"
				caption={t('overview.interfaces')}
				rows={ifaceRows}
				rowKey={(r) => r.name}
				columns={[
					{ key: 'name', label: t('overview.col.interface'), sortable: true },
					{ key: 'proto', label: t('overview.col.protocol') },
					{ key: 'up', label: t('overview.col.status') },
					{ key: 'addrs', label: t('overview.col.addresses') },
					{ key: 'device', label: t('overview.col.device') },
					{ key: 'rx', label: t('overview.col.rx'), align: 'right' },
					{ key: 'tx', label: t('overview.col.tx'), align: 'right' },
					{ key: 'uptime', label: t('overview.col.uptime'), align: 'right' },
				]}
			>
				{#snippet cell(row, col)}
					{#if col.key === 'up'}
						<span class="badge badge-sm {row.up ? 'badge-success' : 'badge-error'}"
							>{row.up ? t('overview.up') : t('overview.down')}</span
						>
					{:else if col.key === 'rx' || col.key === 'tx'}
						{formatRate(row[col.key])}
					{:else if col.key === 'uptime'}
						{row.up ? formatDuration(row.uptime) : '—'}
					{:else if col.key === 'addrs'}
						<span class="font-mono text-xs whitespace-nowrap">{row.addrs || '—'}</span>
					{:else}
						{row[col.key as 'name']}
					{/if}
				{/snippet}
			</DataTable>
		</Section>

		<Section title={t('overview.leases')}>
			{#if errors.leases}<p role="alert" class="text-error text-sm">{errors.leases}</p>{/if}
			<DataTable
				testid="overview-leases"
				caption={t('overview.leases')}
				rows={leaseRows}
				rowKey={(r) => r.address}
				empty={t('overview.no_leases')}
				filter={leaseRows.length > 10}
				columns={[
					{ key: 'hostname', label: t('overview.col.hostname'), sortable: true },
					{ key: 'address', label: t('overview.col.address'), sortable: true },
					{ key: 'id', label: t('overview.col.mac') },
					{
						key: 'expires',
						label: t('overview.col.expires'),
						align: 'right',
						sortable: true,
					},
				]}
			>
				{#snippet cell(row, col)}
					{#if col.key === 'expires'}
						{row.expires < 0 ? t('overview.infinite') : formatDuration(row.expires)}
					{:else if col.key === 'address' || col.key === 'id'}
						<span class="font-mono text-xs">{row[col.key]}</span>
					{:else}
						{row.hostname || '—'}
					{/if}
				{/snippet}
			</DataTable>
		</Section>
	{/if}
</Page>
