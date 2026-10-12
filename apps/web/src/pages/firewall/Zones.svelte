<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Firewall → Zones: zone policies, covered networks and forwardings. -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { isRpcError } from '@nuci/rpc';
	import {
		asList,
		ListField,
		Page,
		Section,
		SectionList,
		Select,
		TextField,
		Toggle,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { uci } from '../../lib/services';
	import { session } from '../../lib/session.svelte';
	import { policyOptions, show } from './options';

	let error = $state('');
	const networks = $derived(
		uci
			.sections('network', 'interface')
			.map((s) => s['.name'])
			.filter((n) => n !== 'loopback'),
	);
	const zoneName = (s: string) => String(uci.get('firewall', s, 'name') ?? '');

	onMount(() => {
		uci.load('firewall', 'network').catch(
			(e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)),
		);
	});

	function forwardsFrom(zone: string): string[] {
		return uci
			.sections('firewall', 'forwarding')
			.filter((f) => f.src === zone)
			.map((f) => String(f.dest));
	}

	/** Make the zone's outgoing forwardings exactly `dests`. */
	function setForwards(zone: string, dests: string[]) {
		for (const f of uci.sections('firewall', 'forwarding'))
			if (f.src === zone && !dests.includes(String(f.dest)))
				uci.remove('firewall', f['.name']);
		const have = forwardsFrom(zone);
		for (const d of dests)
			if (!have.includes(d))
				uci.add('firewall', 'forwarding', undefined, { src: zone, dest: d });
	}

	const NAME = (v: string) =>
		/^[A-Za-z0-9_]{1,11}$/.test(v) ? null : 'firewall.zone_name_invalid';
</script>

<Page
	title={t('firewall.zones_title')}
	description={t('firewall.zones_help')}
	readonly={!session.canWriteUci('firewall')}
>
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	{#if uci.isLoaded('firewall') && uci.isLoaded('network')}
		<Section>
			<SectionList
				config="firewall"
				type="zone"
				testid="zones"
				addLabel={t('firewall.add_zone')}
				editTitle={t('firewall.zone')}
				defaults={{ name: 'newzone', input: 'ACCEPT', output: 'ACCEPT', forward: 'REJECT' }}
				columns={[
					{ option: 'name', label: t('firewall.zone') },
					{
						option: 'network',
						label: t('firewall.networks'),
						format: (v) => show(asList(v)),
					},
					{ option: 'input', label: t('firewall.input') },
					{ option: 'output', label: t('firewall.output') },
					{ option: 'forward', label: t('firewall.forward') },
					{
						option: 'masq',
						label: t('firewall.masq'),
						format: (v) => (v === '1' ? '✓' : '—'),
					},
					{
						option: '.forwards',
						label: t('firewall.forwards_to'),
						format: (_v, s) => show(forwardsFrom(zoneName(s))),
					},
				]}
			>
				{#snippet editor(s)}
					<TextField
						label={t('firewall.zone_name')}
						uci="firewall.{s}.name"
						validate={NAME}
						testid="zone-name"
					/>
					<Select
						label={t('firewall.input')}
						uci="firewall.{s}.input"
						options={policyOptions()}
					/>
					<Select
						label={t('firewall.output')}
						uci="firewall.{s}.output"
						options={policyOptions()}
					/>
					<Select
						label={t('firewall.forward')}
						uci="firewall.{s}.forward"
						options={policyOptions()}
					/>
					<Toggle
						label={t('firewall.masq')}
						uci="firewall.{s}.masq"
						default={false}
						description={t('firewall.masq_help')}
					/>
					<Toggle
						label={t('firewall.mtu_fix')}
						uci="firewall.{s}.mtu_fix"
						default={false}
					/>
					<ListField
						label={t('firewall.networks')}
						uci="firewall.{s}.network"
						options={networks.map((n) => ({ value: n, label: n }))}
						testid="zone-networks"
					/>
					<ListField
						label={t('firewall.forwards_to')}
						values={forwardsFrom(zoneName(s))}
						options={uci
							.sections('firewall', 'zone')
							.filter((z) => z['.name'] !== s)
							.map((z) => ({ value: String(z.name), label: String(z.name) }))}
						onchange={(v) => setForwards(zoneName(s), v)}
						description={t('firewall.forwards_help')}
						testid="zone-forwards"
					/>
				{/snippet}
			</SectionList>
		</Section>
	{/if}
</Page>
