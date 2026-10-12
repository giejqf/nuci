<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Network → Static routes (IPv4 `route` and IPv6 `route6` sections). -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { isRpcError } from '@nuci/rpc';
	import { Page, Section, SectionList, Select, TextField, validators } from '@nuci/ui';
	import { onMount } from 'svelte';
	import { uci } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	let error = $state('');
	const ifaces = $derived(
		uci.sections('network', 'interface').map((s) => ({ value: s['.name'], label: s['.name'] })),
	);
	const cidr6 = (v: string) => {
		if (v === '') return null;
		const [ip = '', p, extra] = v.split('/');
		return extra === undefined &&
			!validators.ipv6(ip) &&
			(p === undefined || (/^[0-9]{1,3}$/.test(p) && Number(p) <= 128))
			? null
			: 'routes.cidr6_invalid';
	};
	onMount(() => {
		uci.load('network').catch((e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)));
	});
</script>

<Page
	title={t('routes.title')}
	description={t('routes.description')}
	readonly={!session.canWriteUci('network')}
>
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	{#if uci.isLoaded('network')}
		<Section title={t('routes.ipv4')}>
			<SectionList
				config="network"
				type="route"
				testid="routes4"
				addLabel={t('routes.add')}
				editTitle={t('routes.ipv4')}
				defaults={{ interface: 'lan' }}
				columns={[
					{ option: 'target', label: t('routes.target') },
					{ option: 'gateway', label: t('routes.gateway') },
					{ option: 'interface', label: t('routes.interface') },
					{ option: 'metric', label: t('proto.metric') },
				]}
			>
				{#snippet editor(s)}
					<Select
						label={t('routes.interface')}
						uci="network.{s}.interface"
						options={ifaces}
						testid="route-iface"
					/>
					<TextField
						label={t('routes.target')}
						uci="network.{s}.target"
						validate={validators.all(validators.required, validators.cidr4)}
						placeholder="10.0.0.0/8"
						testid="route-target"
					/>
					<TextField
						label={t('routes.gateway')}
						uci="network.{s}.gateway"
						validate={validators.ipv4}
						testid="route-gateway"
					/>
					<TextField
						label={t('proto.metric')}
						uci="network.{s}.metric"
						validate={validators.integer(0, 9999)}
						placeholder="0"
					/>
					<TextField
						label={t('routes.table')}
						uci="network.{s}.table"
						placeholder="main"
					/>
				{/snippet}
			</SectionList>
		</Section>
		<Section title={t('routes.ipv6')}>
			<SectionList
				config="network"
				type="route6"
				testid="routes6"
				addLabel={t('routes.add')}
				editTitle={t('routes.ipv6')}
				defaults={{ interface: 'lan' }}
				columns={[
					{ option: 'target', label: t('routes.target') },
					{ option: 'gateway', label: t('routes.gateway') },
					{ option: 'interface', label: t('routes.interface') },
					{ option: 'metric', label: t('proto.metric') },
				]}
			>
				{#snippet editor(s)}
					<Select
						label={t('routes.interface')}
						uci="network.{s}.interface"
						options={ifaces}
					/>
					<TextField
						label={t('routes.target')}
						uci="network.{s}.target"
						validate={(v) => validators.required(v) ?? cidr6(v)}
						placeholder="2001:db8::/32"
					/>
					<TextField
						label={t('routes.gateway')}
						uci="network.{s}.gateway"
						validate={validators.ipv6}
					/>
					<TextField
						label={t('proto.metric')}
						uci="network.{s}.metric"
						validate={validators.integer(0, 9999)}
						placeholder="0"
					/>
				{/snippet}
			</SectionList>
		</Section>
	{/if}
</Page>
