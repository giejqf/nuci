<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Network → DHCP & DNS: dnsmasq settings, static leases, active leases. -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { isRpcError, type DhcpLease } from '@nuci/rpc';
	import {
		DataTable,
		DynamicList,
		Form,
		formatDuration,
		Page,
		Section,
		SectionList,
		Tabs,
		TextField,
		Toggle,
		validators,
		poll,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { rpc, uci } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	let tab = $state('general');
	let leases = $state<DhcpLease[]>([]);
	let error = $state('');
	const d = '@dnsmasq[0]';
	const MAC = (v: string) =>
		v === '' || /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(v) ? null : 'network.mac_invalid';
	// dnsmasq server entries: an address, or /domain/address
	const SERVER = (v: string) =>
		/^(\/[^/]*\/)?[0-9A-Fa-f.:]+(#[0-9]+)?$/.test(v) ? null : 'dhcp.server_invalid';

	onMount(() => {
		uci.load('dhcp').catch((e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)));
		const load = () =>
			rpc.nuci.dhcp
				.leases()
				.then((l) => (leases = l))
				.catch(() => {});
		return poll(load, 10_000);
	});

	const tabs = $derived([
		{ id: 'general', label: t('dhcp.tab.general') },
		{ id: 'static', label: t('dhcp.tab.static') },
		{ id: 'leases', label: t('dhcp.tab.leases', { count: leases.length }) },
		{ id: 'advanced', label: t('dhcp.tab.advanced') },
	]);
</script>

<Page
	title={t('dhcp.title')}
	description={t('dhcp.description')}
	readonly={!session.canWriteUci('dhcp')}
>
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	{#if uci.isLoaded('dhcp')}
		<Tabs {tabs} bind:active={tab}>
			{#snippet children(active)}
				{#if active === 'general'}
					<Form>
						<Section>
							<TextField
								label={t('dhcp.domain')}
								uci="dhcp.{d}.domain"
								validate={validators.hostname}
								description={t('dhcp.domain_help')}
								testid="dhcp-domain"
							/>
							<TextField
								label={t('dhcp.local')}
								uci="dhcp.{d}.local"
								description={t('dhcp.local_help')}
								placeholder="/lan/"
							/>
							<DynamicList
								label={t('dhcp.servers')}
								uci="dhcp.{d}.server"
								validate={SERVER}
								description={t('dhcp.servers_help')}
								placeholder="1.1.1.1"
								testid="dhcp-servers"
							/>
							<Toggle
								label={t('dhcp.authoritative')}
								uci="dhcp.{d}.authoritative"
								default={false}
								description={t('dhcp.authoritative_help')}
							/>
							<Toggle
								label={t('dhcp.rebind_protection')}
								uci="dhcp.{d}.rebind_protection"
								default={false}
								description={t('dhcp.rebind_help')}
							/>
							<Toggle
								label={t('dhcp.localservice')}
								uci="dhcp.{d}.localservice"
								default={false}
								description={t('dhcp.localservice_help')}
							/>
						</Section>
					</Form>
				{:else if active === 'static'}
					<Section description={t('dhcp.static_help')}>
						<SectionList
							config="dhcp"
							type="host"
							testid="static-leases"
							addLabel={t('dhcp.add_lease')}
							editTitle={t('dhcp.static_lease')}
							columns={[
								{ option: 'name', label: t('overview.col.hostname') },
								{ option: 'mac', label: t('network.macaddr') },
								{ option: 'ip', label: t('dhcp.ipv4') },
								{ option: 'leasetime', label: t('network.dhcp_leasetime') },
							]}
						>
							{#snippet editor(s)}
								<TextField
									label={t('overview.col.hostname')}
									uci="dhcp.{s}.name"
									validate={validators.hostname}
									testid="lease-name"
								/>
								<DynamicList
									label={t('network.macaddr')}
									uci="dhcp.{s}.mac"
									validate={MAC}
									placeholder="aa:bb:cc:dd:ee:ff"
									testid="lease-mac"
								/>
								<TextField
									label={t('dhcp.ipv4')}
									uci="dhcp.{s}.ip"
									validate={validators.ipv4}
									testid="lease-ip"
								/>
								<TextField
									label={t('network.dhcp_leasetime')}
									uci="dhcp.{s}.leasetime"
									placeholder="infinite"
								/>
							{/snippet}
						</SectionList>
					</Section>
				{:else if active === 'leases'}
					<Section>
						<DataTable
							testid="active-leases"
							rows={leases}
							rowKey={(l) => `${l.family}-${l.address}`}
							empty={t('overview.no_leases')}
							filter
							columns={[
								{
									key: 'hostname',
									label: t('overview.col.hostname'),
									sortable: true,
								},
								{
									key: 'address',
									label: t('overview.col.address'),
									sortable: true,
								},
								{ key: 'macaddr', label: t('overview.col.mac') },
								{
									key: 'expires',
									label: t('overview.col.expires'),
									align: 'right',
									sortable: true,
								},
							]}
						>
							{#snippet cell(l, c)}
								{#if c.key === 'expires'}{l.expires < 0
										? t('overview.infinite')
										: formatDuration(l.expires)}
								{:else if c.key === 'macaddr'}<span class="font-mono text-xs"
										>{l.macaddr ?? l.duid ?? ''}</span
									>
								{:else if c.key === 'address'}<span class="font-mono text-xs"
										>{l.address}</span
									>
								{:else}{l.hostname ?? '—'}{/if}
							{/snippet}
						</DataTable>
					</Section>
				{:else}
					<Form>
						<Section>
							<TextField
								label={t('dhcp.cachesize')}
								uci="dhcp.{d}.cachesize"
								validate={validators.integer(0, 10000)}
								placeholder="150"
							/>
							<TextField
								label={t('dhcp.ednspacket_max')}
								uci="dhcp.{d}.ednspacket_max"
								validate={validators.integer(512, 4096)}
								placeholder="1232"
							/>
							<Toggle
								label={t('dhcp.domainneeded')}
								uci="dhcp.{d}.domainneeded"
								default={false}
							/>
							<Toggle
								label={t('dhcp.boguspriv')}
								uci="dhcp.{d}.boguspriv"
								default={false}
							/>
							<Toggle
								label={t('dhcp.localise_queries')}
								uci="dhcp.{d}.localise_queries"
								default={false}
							/>
							<Toggle
								label={t('dhcp.expandhosts')}
								uci="dhcp.{d}.expandhosts"
								default={false}
							/>
							<Toggle
								label={t('dhcp.readethers')}
								uci="dhcp.{d}.readethers"
								default={false}
							/>
							<Toggle
								label={t('dhcp.logqueries')}
								uci="dhcp.{d}.logqueries"
								default={false}
							/>
							<Toggle
								label={t('dhcp.filter_aaaa')}
								uci="dhcp.{d}.filter_aaaa"
								default={false}
							/>
						</Section>
					</Form>
				{/if}
			{/snippet}
		</Tabs>
	{/if}
</Page>
