<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Network → Hostnames: local DNS records (dhcp `domain` sections). -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { isRpcError } from '@nuci/rpc';
	import { Page, Section, SectionList, TextField, validators } from '@nuci/ui';
	import { onMount } from 'svelte';
	import { uci } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	let error = $state('');
	onMount(() => {
		uci.load('dhcp').catch((e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)));
	});
</script>

<Page
	title={t('hostnames.title')}
	description={t('hostnames.description')}
	readonly={!session.canWriteUci('dhcp')}
>
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	{#if uci.isLoaded('dhcp')}
		<Section>
			<SectionList
				config="dhcp"
				type="domain"
				testid="hostnames"
				addLabel={t('hostnames.add')}
				editTitle={t('hostnames.entry')}
				columns={[
					{ option: 'name', label: t('overview.col.hostname') },
					{ option: 'ip', label: t('overview.col.address') },
				]}
			>
				{#snippet editor(s)}
					<TextField
						label={t('overview.col.hostname')}
						uci="dhcp.{s}.name"
						validate={validators.all(validators.required, validators.hostname)}
						testid="hostname-name"
					/>
					<TextField
						label={t('overview.col.address')}
						uci="dhcp.{s}.ip"
						validate={validators.all(validators.required, validators.ipaddr)}
						testid="hostname-ip"
					/>
				{/snippet}
			</SectionList>
		</Section>
	{/if}
</Page>
