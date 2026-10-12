<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Network → Interfaces → <name>: protocol settings (from the registry),
	advanced options, firewall zone and the DHCP server for this interface.
	Every change is staged; the ApplyBar applies it with rollback.
-->
<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { isRpcError } from '@nuci/rpc';
	import { Form, Page, Section, Select, Tabs, TextField, Toggle, validators } from '@nuci/ui';
	import { onMount } from 'svelte';
	import { setZone, zoneOf, zones } from '../../lib/firewall';
	import { rpc, uci } from '../../lib/services';
	import { session } from '../../lib/session.svelte';
	import ProtoFields from './ProtoFields.svelte';
	import { availableProtos, obsoleteOptions, proto } from './proto-registry';

	let { params }: { params: Record<string, string> } = $props();
	const name = $derived(params.name ?? '');

	let tab = $state('general');
	let error = $state('');
	let runtimeDevices = $state<string[]>([]);
	let handlers = $state<Record<string, unknown> | null>(null);

	const writable = $derived(session.canWriteUci('network'));
	const section = $derived(uci.getSection('network', name));
	const protoId = $derived(String(section?.proto ?? 'none'));
	const current = $derived(proto(protoId));
	const dhcpSection = $derived(
		uci.sections('dhcp', 'dhcp').find((d) => d.interface === name)?.['.name'] ?? null,
	);
	const devices = $derived(
		[...uci.sections('network', 'device').map((d) => String(d.name ?? '')), ...runtimeDevices]
			.filter((d, i, a) => d && d !== 'lo' && a.indexOf(d) === i)
			.sort(),
	);
	const zone = $derived(uci.isLoaded('firewall') ? (zoneOf(uci, name) ?? '') : '');

	onMount(() => {
		uci.load('network', 'firewall', 'dhcp').catch(
			(e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)),
		);
		rpc.network
			.devices()
			.then((d) => (runtimeDevices = Object.keys(d)))
			.catch(() => {});
		rpc.network
			.protoHandlers()
			.then((h) => (handlers = h))
			.catch(() => {});
	});

	function changeProto(next: string) {
		for (const opt of obsoleteOptions(protoId, next)) uci.set('network', name, opt, null);
		// set() runs after the Select already staged proto; keep it explicit.
		uci.set('network', name, 'proto', next);
	}

	function setupDhcp() {
		uci.add('dhcp', 'dhcp', name, {
			interface: name,
			start: '100',
			limit: '150',
			leasetime: '12h',
		});
	}

	const tabs = $derived([
		{ id: 'general', label: t('network.tab.general') },
		{ id: 'advanced', label: t('network.tab.advanced') },
		{ id: 'firewall', label: t('network.tab.firewall') },
		...(current?.dhcpServer ? [{ id: 'dhcp', label: t('network.tab.dhcp') }] : []),
	]);
	const modes = () =>
		['server', 'relay', 'hybrid', 'disabled'].map((m) => ({
			value: m,
			label: t(`network.dhcp_mode.${m}`),
		}));
</script>

<Page title={t('network.iface_title', { name: name.toUpperCase() })} readonly={!writable}>
	{#snippet actions()}
		<a class="btn btn-ghost btn-sm" href="#/network/interfaces"
			><ArrowLeft size={16} aria-hidden="true" />{t('network.interfaces')}</a
		>
	{/snippet}
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	{#if uci.isLoaded('network') && !section}
		<div role="alert" class="alert alert-warning">{t('network.iface_missing', { name })}</div>
	{:else if section}
		<Tabs {tabs} bind:active={tab}>
			{#snippet children(active)}
				<Form>
					{#if active === 'general'}
						<Section>
							<Select
								label={t('network.protocol')}
								uci="network.{name}.proto"
								options={availableProtos(handlers, protoId).map((p) => ({
									value: p.id,
									label: t(p.label),
								}))}
								onchange={changeProto}
								testid="field-proto"
							/>
							{#if !current?.noDevice}<Select
									label={t('network.device')}
									uci="network.{name}.device"
									options={[
										{ value: '', label: t('network.no_device') },
										...devices.map((d) => ({ value: d, label: d })),
									]}
									testid="field-device"
								/>{/if}
							{#if current}<ProtoFields
									iface={name}
									fields={current.fields.filter((f) => !f.advanced)}
								/>{/if}
						</Section>
					{:else if active === 'advanced'}
						<Section>
							<Toggle
								label={t('network.auto')}
								uci="network.{name}.auto"
								default={true}
								description={t('network.auto_help')}
							/>
							<Toggle
								label={t('network.disabled')}
								uci="network.{name}.disabled"
								default={false}
							/>
							{#if current}<ProtoFields
									iface={name}
									fields={current.fields.filter((f) => f.advanced)}
								/>{/if}
						</Section>
					{:else if active === 'firewall'}
						<Section description={t('network.zone_help')}>
							<Select
								label={t('network.firewall_zone')}
								value={zone}
								options={[
									{ value: '', label: t('network.no_zone') },
									...zones(uci).map((z) => ({ value: z.name, label: z.name })),
								]}
								readonly={!session.canWriteUci('firewall')}
								onchange={(z) => setZone(uci, name, z || null)}
								testid="field-zone"
							/>
						</Section>
					{:else if active === 'dhcp'}
						<Section>
							{#if !dhcpSection}
								<p class="text-sm">{t('network.dhcp_none')}</p>
								{#if writable}<div>
										<button
											type="button"
											class="btn btn-sm"
											onclick={setupDhcp}
											data-testid="dhcp-setup"
											>{t('network.dhcp_setup')}</button
										>
									</div>{/if}
							{:else}
								<Toggle
									label={t('network.dhcp_ignore')}
									uci="dhcp.{dhcpSection}.ignore"
									default={false}
									description={t('network.dhcp_ignore_help')}
									testid="dhcp-ignore"
								/>
								<TextField
									label={t('network.dhcp_start')}
									uci="dhcp.{dhcpSection}.start"
									validate={validators.integer(1, 65535)}
									description={t('network.dhcp_start_help')}
									testid="dhcp-start"
								/>
								<TextField
									label={t('network.dhcp_limit')}
									uci="dhcp.{dhcpSection}.limit"
									validate={validators.integer(1, 65535)}
									description={t('network.dhcp_limit_help')}
									testid="dhcp-limit"
								/>
								<TextField
									label={t('network.dhcp_leasetime')}
									uci="dhcp.{dhcpSection}.leasetime"
									validate={(v) =>
										v === '' || /^([0-9]+[smhdw]?|infinite)$/.test(v)
											? null
											: 'network.leasetime_invalid'}
									placeholder="12h"
								/>
								<Select
									label={t('network.dhcpv4')}
									uci="dhcp.{dhcpSection}.dhcpv4"
									options={modes().filter(
										(m) => m.value !== 'relay' && m.value !== 'hybrid',
									)}
									placeholder={t('proto.default')}
								/>
								<Select
									label={t('network.dhcpv6')}
									uci="dhcp.{dhcpSection}.dhcpv6"
									options={modes()}
									placeholder={t('proto.default')}
								/>
								<Select
									label={t('network.ra')}
									uci="dhcp.{dhcpSection}.ra"
									options={modes()}
									placeholder={t('proto.default')}
								/>
							{/if}
						</Section>
					{/if}
				</Form>
			{/snippet}
		</Tabs>
	{/if}
</Page>
