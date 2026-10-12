<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Firewall → Port forwards (redirect sections, DNAT). -->
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
	import { enabled, protoOptions, show, zoneOptions } from './options';

	let error = $state('');
	onMount(() => {
		uci.load('firewall').catch((e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)));
	});
	const isDnat = (s: string) => (uci.get('firewall', s, 'target') ?? 'DNAT') === 'DNAT';
</script>

<Page
	title={t('firewall.forwards_title')}
	description={t('firewall.forwards_page_help')}
	readonly={!session.canWriteUci('firewall')}
>
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	{#if uci.isLoaded('firewall')}
		<Section>
			<SectionList
				config="firewall"
				type="redirect"
				testid="forwards"
				filter={isDnat}
				addLabel={t('firewall.add_forward')}
				editTitle={t('firewall.forward_rule')}
				defaults={{ target: 'DNAT', src: 'wan', dest: 'lan', proto: ['tcp', 'udp'] }}
				columns={[
					{ option: 'name', label: t('firewall.name') },
					{ option: 'proto', label: t('firewall.proto'), format: show },
					{ option: 'src_dport', label: t('firewall.external_port') },
					{ option: 'dest_ip', label: t('firewall.internal_ip') },
					{
						option: 'dest_port',
						label: t('firewall.internal_port'),
						format: (v, s) => show(v ?? uci.get('firewall', s, 'src_dport')),
					},
					{ option: 'enabled', label: t('firewall.status'), format: enabled },
				]}
			>
				{#snippet editor(s)}
					<TextField
						label={t('firewall.name')}
						uci="firewall.{s}.name"
						testid="fwd-name"
					/>
					<ListField
						label={t('firewall.proto')}
						uci="firewall.{s}.proto"
						options={protoOptions(false)}
					/>
					<Select
						label={t('firewall.src_zone')}
						uci="firewall.{s}.src"
						options={zoneOptions(uci)}
					/>
					<TextField
						label={t('firewall.external_port')}
						uci="firewall.{s}.src_dport"
						validate={validators.all(validators.required, validators.portRange)}
						testid="fwd-src-dport"
					/>
					<Select
						label={t('firewall.dest_zone')}
						uci="firewall.{s}.dest"
						options={zoneOptions(uci)}
					/>
					<TextField
						label={t('firewall.internal_ip')}
						uci="firewall.{s}.dest_ip"
						validate={validators.all(validators.required, validators.ipv4)}
						testid="fwd-dest-ip"
					/>
					<TextField
						label={t('firewall.internal_port')}
						uci="firewall.{s}.dest_port"
						validate={validators.portRange}
						description={t('firewall.internal_port_help')}
						testid="fwd-dest-port"
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
