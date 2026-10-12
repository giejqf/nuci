<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Firewall → NAT rules (fw4 `nat` sections: SNAT / MASQUERADE / ACCEPT). -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { isRpcError } from '@nuci/rpc';
	import {
		ListField,
		Page,
		Section,
		SectionList,
		Select,
		TextField,
		Toggle,
		validators,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { uci } from '../../lib/services';
	import { session } from '../../lib/session.svelte';
	import { enabled, familyOptions, protoOptions, zoneOptions } from './options';

	let error = $state('');
	onMount(() => {
		uci.load('firewall').catch((e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)));
	});
	const targets = () =>
		['SNAT', 'MASQUERADE', 'ACCEPT'].map((x) => ({
			value: x,
			label: t(`firewall.nat_target.${x}`),
		}));
</script>

<Page
	title={t('firewall.nat_title')}
	description={t('firewall.nat_help')}
	readonly={!session.canWriteUci('firewall')}
>
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	{#if uci.isLoaded('firewall')}
		<Section>
			<SectionList
				config="firewall"
				type="nat"
				testid="nat"
				addLabel={t('firewall.add_nat')}
				editTitle={t('firewall.nat_rule')}
				defaults={{ src: 'wan', target: 'MASQUERADE', proto: 'all' }}
				columns={[
					{ option: 'name', label: t('firewall.name') },
					{ option: 'src', label: t('firewall.outbound_zone') },
					{ option: 'src_ip', label: t('firewall.src_ip') },
					{ option: 'dest_ip', label: t('firewall.dest_ip') },
					{ option: 'target', label: t('firewall.action') },
					{ option: 'snat_ip', label: t('firewall.snat_ip') },
					{ option: 'enabled', label: t('firewall.status'), format: enabled },
				]}
			>
				{#snippet editor(s)}
					{@const target = String(uci.get('firewall', s, 'target') ?? 'MASQUERADE')}
					<TextField
						label={t('firewall.name')}
						uci="firewall.{s}.name"
						testid="nat-name"
					/>
					<Select
						label={t('firewall.family_label')}
						uci="firewall.{s}.family"
						options={familyOptions()}
					/>
					<ListField
						label={t('firewall.proto')}
						uci="firewall.{s}.proto"
						options={protoOptions(true)}
						description={t('firewall.proto_all_help')}
					/>
					<Select
						label={t('firewall.outbound_zone')}
						uci="firewall.{s}.src"
						options={zoneOptions(uci)}
					/>
					<TextField
						label={t('firewall.src_ip')}
						uci="firewall.{s}.src_ip"
						validate={validators.ipOrCidr}
						testid="nat-src-ip"
					/>
					<TextField
						label={t('firewall.dest_ip')}
						uci="firewall.{s}.dest_ip"
						validate={validators.ipOrCidr}
					/>
					<TextField
						label={t('firewall.dest_port')}
						uci="firewall.{s}.dest_port"
						validate={validators.portRange}
					/>
					<Select
						label={t('firewall.action')}
						uci="firewall.{s}.target"
						options={targets()}
						testid="nat-target"
					/>
					{#if target === 'SNAT'}
						<TextField
							label={t('firewall.snat_ip')}
							uci="firewall.{s}.snat_ip"
							validate={validators.all(validators.required, validators.ipv4)}
							testid="nat-snat-ip"
						/>
						<TextField
							label={t('firewall.snat_port')}
							uci="firewall.{s}.snat_port"
							validate={validators.portRange}
						/>
					{/if}
					<Toggle
						label={t('firewall.enabled')}
						uci="firewall.{s}.enabled"
						default={true}
					/>
				{/snippet}
			</SectionList>
		</Section>
	{/if}
</Page>
