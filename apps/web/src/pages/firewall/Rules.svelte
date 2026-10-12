<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Firewall → Traffic rules (rule sections). -->
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
	import {
		enabled,
		familyOptions,
		policyOptions,
		protoOptions,
		show,
		zoneOptions,
	} from './options';

	let error = $state('');
	onMount(() => {
		uci.load('firewall').catch((e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)));
	});
	const zoneLabel = (v: unknown, empty: string) =>
		v === '*' ? t('firewall.any_zone') : v ? String(v) : empty;
</script>

<Page
	title={t('firewall.rules_title')}
	description={t('firewall.rules_help')}
	readonly={!session.canWriteUci('firewall')}
>
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	{#if uci.isLoaded('firewall')}
		<Section>
			<SectionList
				config="firewall"
				type="rule"
				testid="rules"
				addLabel={t('firewall.add_rule')}
				editTitle={t('firewall.rule')}
				defaults={{ src: 'wan', target: 'ACCEPT', proto: ['tcp', 'udp'] }}
				columns={[
					{ option: 'name', label: t('firewall.name') },
					{
						option: 'src',
						label: t('firewall.from'),
						format: (v) => zoneLabel(v, t('firewall.device')),
					},
					{
						option: 'dest',
						label: t('firewall.to'),
						format: (v) => zoneLabel(v, t('firewall.device')),
					},
					{ option: 'proto', label: t('firewall.proto'), format: show },
					{ option: 'dest_port', label: t('firewall.dest_port') },
					{ option: 'target', label: t('firewall.action') },
					{ option: 'enabled', label: t('firewall.status'), format: enabled },
				]}
			>
				{#snippet editor(s)}
					<TextField
						label={t('firewall.name')}
						uci="firewall.{s}.name"
						testid="rule-name"
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
					/>
					<Select
						label={t('firewall.src_zone')}
						uci="firewall.{s}.src"
						options={zoneOptions(uci, [
							{ value: '', label: t('firewall.device') },
							{ value: '*', label: t('firewall.any_zone') },
						])}
					/>
					<TextField
						label={t('firewall.src_ip')}
						uci="firewall.{s}.src_ip"
						validate={validators.ipOrCidr}
					/>
					<TextField
						label={t('firewall.src_port')}
						uci="firewall.{s}.src_port"
						validate={validators.portRange}
					/>
					<Select
						label={t('firewall.dest_zone')}
						uci="firewall.{s}.dest"
						options={zoneOptions(uci, [
							{ value: '', label: t('firewall.device') },
							{ value: '*', label: t('firewall.any_zone') },
						])}
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
						testid="rule-dest-port"
					/>
					<Select
						label={t('firewall.action')}
						uci="firewall.{s}.target"
						options={policyOptions()}
						testid="rule-target"
					/>
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
