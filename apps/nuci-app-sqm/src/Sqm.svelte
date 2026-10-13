<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Network → SQM QoS: sqm-scripts queues (uci sqm) against bufferbloat, with
	the active qdiscs per interface. Changes are staged in the host.
-->
<script lang="ts">
	import type { HostContext } from '@nuci/app-sdk';
	import { t } from '@nuci/i18n';
	import {
		formatBytes,
		getNuciContext,
		Section,
		SectionList,
		Select,
		TextField,
		Toggle,
		validators,
		poll,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { sqmApi, type SqmStatus } from './api';

	let { host }: { host: HostContext } = $props();
	const uci = getNuciContext().uci;

	const api = $derived(sqmApi(host));
	let status = $state<SqmStatus>({});
	let devices = $state<string[]>([]);

	async function refresh() {
		try {
			status = await api.status();
		} catch {
			// status is best effort
		}
	}

	onMount(() => {
		void host.uci.load('sqm');
		void host
			.call<Record<string, unknown>>('network.device', 'status')
			.then(
				(d) =>
					(devices = Object.keys(d)
						.filter((n) => n !== 'lo' && !n.startsWith('ifb'))
						.sort()),
			)
			.catch(() => {});
		return poll(refresh, 5000);
	});

	const describe = (q?: SqmStatus[string]['egress'][number]) =>
		q
			? `${q.kind}${q.bandwidth ? ` ${q.bandwidth}` : ''} · ${formatBytes(q.sent_bytes ?? 0)} · ${t('sqm.dropped', { n: q.dropped ?? 0 })}`
			: t('sqm.inactive');
</script>

{#if uci.isLoaded('sqm')}
	<Section title={t('sqm.queues')} description={t('sqm.help')}>
		<SectionList
			config="sqm"
			type="queue"
			testid="sqm-queues"
			addLabel={t('sqm.add')}
			editTitle={t('sqm.queue')}
			defaults={{
				enabled: '1',
				interface: 'eth1',
				download: '85000',
				upload: '10000',
				qdisc: 'cake',
				script: 'piece_of_cake.qos',
				linklayer: 'none',
			}}
			columns={[
				{ option: 'interface', label: t('sqm.interface') },
				{
					option: 'enabled',
					label: t('sqm.enabled'),
					format: (v) => (v === '1' ? t('sqm.on') : t('sqm.off')),
				},
				{ option: 'download', label: t('sqm.download') },
				{ option: 'upload', label: t('sqm.upload') },
				{
					option: 'qdisc',
					label: t('sqm.active'),
					format: (_v, s) =>
						describe(status[String(uci.get('sqm', s, 'interface') ?? '')]?.egress[0]),
				},
			]}
		>
			{#snippet editor(s)}
				<Toggle
					label={t('sqm.enabled')}
					uci="sqm.{s}.enabled"
					default={false}
					testid="sqm-enabled"
				/>
				<Select
					label={t('sqm.interface')}
					uci="sqm.{s}.interface"
					options={devices.map((d) => ({ value: d, label: d }))}
					description={t('sqm.interface_help')}
					testid="sqm-interface"
				/>
				<TextField
					label={t('sqm.download')}
					uci="sqm.{s}.download"
					validate={validators.integer(0, 100_000_000)}
					description={t('sqm.speed_help')}
					testid="sqm-download"
				/>
				<TextField
					label={t('sqm.upload')}
					uci="sqm.{s}.upload"
					validate={validators.integer(0, 100_000_000)}
					testid="sqm-upload"
				/>
				<Select
					label={t('sqm.qdisc')}
					uci="sqm.{s}.qdisc"
					options={[
						{ value: 'cake', label: 'cake' },
						{ value: 'fq_codel', label: 'fq_codel' },
					]}
				/>
				<Select
					label={t('sqm.script')}
					uci="sqm.{s}.script"
					options={[
						'piece_of_cake.qos',
						'layer_cake.qos',
						'simple.qos',
						'simplest.qos',
					].map((x) => ({
						value: x,
						label: x,
					}))}
				/>
				<Select
					label={t('sqm.linklayer')}
					uci="sqm.{s}.linklayer"
					options={[
						{ value: 'none', label: t('sqm.linklayer_none') },
						{ value: 'ethernet', label: 'Ethernet / VDSL' },
						{ value: 'atm', label: 'ATM (ADSL)' },
					]}
				/>
				<TextField
					label={t('sqm.overhead')}
					uci="sqm.{s}.overhead"
					validate={validators.integer(-64, 256)}
				/>
			{/snippet}
		</SectionList>
	</Section>

	<Section title={t('sqm.status')}>
		{#each Object.entries(status) as [dev, st] (dev)}
			<dl
				class="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]"
				data-testid="sqm-status-{dev}"
			>
				<dt class="font-mono">{dev} {t('sqm.egress')}</dt>
				<dd>{describe(st.egress[0])}</dd>
				<dt class="font-mono">{dev} {t('sqm.ingress')}</dt>
				<dd>{describe(st.ingress[0])}</dd>
			</dl>
		{:else}
			<p class="text-base-content/70 text-sm">{t('sqm.no_queues')}</p>
		{/each}
	</Section>
{/if}
