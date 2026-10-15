<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Status → Realtime graphs, fed by the stats / conntrack / wifi streams
	(SSE or polling, chosen by @nuci/rpc). Three minutes of history.
-->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import {
		type ConntrackEntry,
		type ConntrackSummary,
		type RealtimeStats,
		type WifiDeviceStats,
	} from '@nuci/rpc';
	import {
		DataTable,
		formatAddress,
		formatBytes,
		formatPercent,
		formatRate,
		LineChart,
		Meter,
		Page,
		Section,
		Tabs,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { rpc } from '../../lib/services';
	import { Ring } from '../../lib/ring.svelte';

	const stats = new Ring();
	const conn = new Ring();
	const wifi = new Ring();
	let latestStats = $state<RealtimeStats | null>(null);
	let latestConn = $state<ConntrackSummary | null>(null);
	let latestWifi = $state<Record<string, WifiDeviceStats>>({});
	let prev: { s: RealtimeStats; at: number } | null = null;
	let tab = $state('load');
	let device = $state('');
	let radio = $state('');
	let connections = $state<ConntrackEntry[]>([]);

	function onStats(s: RealtimeStats) {
		const at = Date.now();
		const values: Record<string, number | null> = {
			l1: s.load[0],
			l5: s.load[1],
			l15: s.load[2],
		};
		if (prev) {
			const dt = (at - prev.at) / 1000;
			const c0 = prev.s.cpu;
			const c1 = s.cpu;
			if (c0 && c1) {
				const sum = (c: typeof c1) =>
					c.user + c.nice + c.system + c.idle + c.iowait + c.irq + c.softirq + c.steal;
				const total = sum(c1) - sum(c0);
				values.cpu =
					total > 0
						? Math.max(0, 1 - (c1.idle + c1.iowait - c0.idle - c0.iowait) / total) * 100
						: null;
			}
			for (const [dev, c] of Object.entries(s.interfaces)) {
				const p = prev.s.interfaces[dev];
				if (p && dt > 0) {
					values[`${dev}:rx`] = Math.max(0, (c.rx_bytes - p.rx_bytes) / dt) * 8;
					values[`${dev}:tx`] = Math.max(0, (c.tx_bytes - p.tx_bytes) / dt) * 8;
				}
			}
		}
		prev = { s, at };
		latestStats = s;
		stats.push(at, values);
		if (!device)
			device =
				'br-lan' in s.interfaces
					? 'br-lan'
					: (Object.keys(s.interfaces).find((d) => d !== 'lo') ?? '');
	}

	function onConn(c: ConntrackSummary) {
		latestConn = c;
		conn.push(Date.now(), { tcp: c.tcp, udp: c.udp, icmp: c.icmp, other: c.other });
	}

	function onWifi(w: Record<string, WifiDeviceStats>) {
		latestWifi = w;
		const values: Record<string, number | null> = {};
		for (const [dev, d] of Object.entries(w)) {
			values[`${dev}:signal`] = d.signal ?? null;
			values[`${dev}:noise`] = d.noise ?? null;
			values[`${dev}:rate`] = d.bitrate == null ? null : d.bitrate / 1000;
		}
		wifi.push(Date.now(), values);
		if (!radio || !(radio in w)) radio = Object.keys(w)[0] ?? '';
	}

	onMount(() => {
		const offs = [
			rpc.events.subscribe('stats', onStats),
			rpc.events.subscribe('conntrack', onConn),
			rpc.events.subscribe('wifi', onWifi),
		];
		return () => offs.forEach((off) => off());
	});

	// Connection table: refreshed every 5 s while the tab is open and visible.
	$effect(() => {
		if (tab !== 'connections') return;
		let gone = false;
		let timer: ReturnType<typeof setTimeout>;
		const loop = async () => {
			if (document.visibilityState === 'visible') {
				try {
					const list = await rpc.nuci.status.conntrack();
					connections = list.sort((a, b) => b.bytes - a.bytes).slice(0, 200);
				} catch {
					connections = [];
				}
			}
			if (!gone) timer = setTimeout(loop, 5000);
		};
		void loop();
		return () => {
			gone = true;
			clearTimeout(timer);
		};
	});

	const devices = $derived(
		Object.keys(latestStats?.interfaces ?? {})
			.filter((d) => d !== 'lo')
			.sort(),
	);
	const radios = $derived(Object.keys(latestWifi).sort());
	const ifaceRows = $derived(
		devices.map((d) => ({
			device: d,
			rx: stats.get(`${d}:rx`).at(-1) ?? null,
			tx: stats.get(`${d}:tx`).at(-1) ?? null,
			rxTotal: latestStats?.interfaces[d]?.rx_bytes ?? 0,
			txTotal: latestStats?.interfaces[d]?.tx_bytes ?? 0,
		})),
	);
	const bits = (v: number) => formatRate(v / 8);
	const fmtEndpoint = (addr: string, port?: number) => {
		const a = formatAddress(addr);
		return port ? (a.includes(':') ? `[${a}]:${port}` : `${a}:${port}`) : a;
	};
	const tabs = $derived([
		{ id: 'load', label: t('realtime.tab.load') },
		{ id: 'traffic', label: t('realtime.tab.traffic') },
		{ id: 'wireless', label: t('realtime.tab.wireless') },
		{ id: 'connections', label: t('realtime.tab.connections') },
	]);
</script>

<Page title={t('realtime.title')} description={t('realtime.description')}>
	<Tabs {tabs} bind:active={tab}>
		{#snippet children(active)}
			{#if active === 'load'}
				<div class="grid gap-4 xl:grid-cols-2">
					<Section title={t('realtime.load')}>
						<LineChart
							testid="chart-load"
							title={t('realtime.load')}
							times={stats.times}
							format={(v) => v.toFixed(2)}
							series={[
								{
									id: 'l1',
									label: t('realtime.load1'),
									slot: 1,
									values: stats.get('l1'),
								},
								{
									id: 'l5',
									label: t('realtime.load5'),
									slot: 2,
									values: stats.get('l5'),
								},
								{
									id: 'l15',
									label: t('realtime.load15'),
									slot: 3,
									values: stats.get('l15'),
								},
							]}
						/>
					</Section>
					<Section title={t('realtime.cpu')}>
						<LineChart
							testid="chart-cpu"
							title={t('realtime.cpu')}
							times={stats.times}
							yMaxAtLeast={100}
							area
							format={(v) => formatPercent(v / 100)}
							tickFormat={(v) => `${v}%`}
							series={[
								{
									id: 'cpu',
									label: t('realtime.cpu'),
									slot: 1,
									values: stats.get('cpu'),
								},
							]}
						/>
					</Section>
				</div>
			{:else if active === 'traffic'}
				<div class="flex flex-col gap-4">
					<label class="flex items-center gap-2 text-sm">
						<span>{t('realtime.interface')}</span>
						<select
							class="select select-sm w-48"
							bind:value={device}
							data-testid="traffic-device"
						>
							{#each devices as d (d)}<option value={d}>{d}</option>{/each}
						</select>
					</label>
					<Section title={t('realtime.traffic_on', { device })}>
						<LineChart
							testid="chart-traffic"
							title={t('realtime.traffic_on', { device })}
							times={stats.times}
							area
							format={bits}
							series={[
								{
									id: 'rx',
									label: t('realtime.rx'),
									slot: 1,
									values: stats.get(`${device}:rx`),
								},
								{
									id: 'tx',
									label: t('realtime.tx'),
									slot: 2,
									values: stats.get(`${device}:tx`),
								},
							]}
						/>
					</Section>
					<Section title={t('realtime.all_interfaces')}>
						<DataTable
							testid="traffic-table"
							rows={ifaceRows}
							rowKey={(r) => r.device}
							columns={[
								{ key: 'device', label: t('realtime.interface'), sortable: true },
								{ key: 'rx', label: t('realtime.rx'), align: 'right' },
								{ key: 'tx', label: t('realtime.tx'), align: 'right' },
								{
									key: 'rxTotal',
									label: t('realtime.rx_total'),
									align: 'right',
									sortable: true,
								},
								{
									key: 'txTotal',
									label: t('realtime.tx_total'),
									align: 'right',
									sortable: true,
								},
							]}
						>
							{#snippet cell(row, col)}
								{#if col.key === 'rx' || col.key === 'tx'}
									{row[col.key] === null ? '—' : bits(row[col.key] as number)}
								{:else if col.key === 'rxTotal' || col.key === 'txTotal'}
									{formatBytes(row[col.key])}
								{:else}
									{row.device}
								{/if}
							{/snippet}
						</DataTable>
					</Section>
				</div>
			{:else if active === 'wireless'}
				{#if !radios.length}
					<Section
						><p class="text-base-content/70" data-testid="wireless-empty">
							{t('overview.no_wireless')}
						</p></Section
					>
				{:else}
					<div class="flex flex-col gap-4">
						<label class="flex items-center gap-2 text-sm">
							<span>{t('realtime.radio')}</span>
							<select class="select select-sm w-48" bind:value={radio}>
								{#each radios as r (r)}<option value={r}
										>{r}
										{latestWifi[r]?.ssid
											? `(${latestWifi[r]?.ssid})`
											: ''}</option
									>{/each}
							</select>
							<span class="text-base-content/70"
								>{t('realtime.stations', {
									count: latestWifi[radio]?.stations ?? 0,
								})}</span
							>
						</label>
						<div class="grid gap-4 xl:grid-cols-2">
							<Section title={t('realtime.signal')}>
								<LineChart
									testid="chart-signal"
									title={t('realtime.signal')}
									times={wifi.times}
									yMin={-100}
									format={(v) => `${v} dBm`}
									series={[
										{
											id: 'signal',
											label: t('realtime.signal_level'),
											slot: 1,
											values: wifi.get(`${radio}:signal`),
										},
										{
											id: 'noise',
											label: t('realtime.noise'),
											slot: 2,
											values: wifi.get(`${radio}:noise`),
										},
									]}
								/>
							</Section>
							<Section title={t('realtime.bitrate')}>
								<LineChart
									testid="chart-bitrate"
									title={t('realtime.bitrate')}
									times={wifi.times}
									format={(v) => `${v.toFixed(1)} Mbit/s`}
									series={[
										{
											id: 'rate',
											label: t('realtime.bitrate'),
											slot: 1,
											values: wifi.get(`${radio}:rate`),
										},
									]}
								/>
							</Section>
						</div>
					</div>
				{/if}
			{:else}
				<div class="flex flex-col gap-4">
					<Section title={t('realtime.connections')}>
						{#if latestConn}
							<dl class="max-w-md">
								<Meter
									label={t('realtime.table_usage')}
									value={latestConn.max
										? latestConn.total / latestConn.max
										: null}
									text="{latestConn.total} / {latestConn.max}"
									testid="conntrack-usage"
								/>
							</dl>
						{/if}
						<LineChart
							testid="chart-connections"
							title={t('realtime.connections')}
							times={conn.times}
							format={(v) => String(Math.round(v))}
							series={[
								{ id: 'tcp', label: 'TCP', slot: 1, values: conn.get('tcp') },
								{ id: 'udp', label: 'UDP', slot: 2, values: conn.get('udp') },
								{ id: 'icmp', label: 'ICMP', slot: 3, values: conn.get('icmp') },
								{
									id: 'other',
									label: t('realtime.other'),
									slot: 4,
									values: conn.get('other'),
								},
							]}
						/>
					</Section>
					<Section title={t('realtime.active_connections')}>
						<DataTable
							testid="conntrack-table"
							rows={connections.map((c, i) => ({ ...c, key: i }))}
							rowKey={(r) => r.key}
							filter
							columns={[
								{
									key: 'protocol',
									label: t('realtime.col.protocol'),
									sortable: true,
								},
								{ key: 'src', label: t('realtime.col.source'), sortable: true },
								{
									key: 'dst',
									label: t('realtime.col.destination'),
									sortable: true,
								},
								{ key: 'state', label: t('realtime.col.state') },
								{
									key: 'bytes',
									label: t('realtime.col.bytes'),
									align: 'right',
									sortable: true,
								},
							]}
						>
							{#snippet cell(row, col)}
								{#if col.key === 'src'}
									<span class="font-mono text-xs"
										>{fmtEndpoint(row.src, row.sport)}</span
									>
								{:else if col.key === 'dst'}
									<span class="font-mono text-xs"
										>{fmtEndpoint(row.dst, row.dport)}</span
									>
								{:else if col.key === 'bytes'}
									{formatBytes(row.bytes)} · {row.packets}
								{:else}
									{row[col.key as 'protocol' | 'state'] ?? '—'}
								{/if}
							{/snippet}
						</DataTable>
					</Section>
				</div>
			{/if}
		{/snippet}
	</Tabs>
</Page>
