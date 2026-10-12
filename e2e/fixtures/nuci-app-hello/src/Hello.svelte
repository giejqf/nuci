<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import type { HostContext } from '@nuci/app-sdk';
	import { t } from '@nuci/i18n';
	import { Section, TextField } from '@nuci/ui';
	import { onMount } from 'svelte';

	let { host }: { host: HostContext } = $props();
	let hostname = $state('');

	onMount(() => {
		void host.uci.load('system');
		void host
			.call<{ hostname: string }>('system', 'board')
			.then((b) => (hostname = b.hostname));
	});
</script>

<Section title={t('hello.section')}>
	<p data-testid="hello-greeting">{hostname ? t('hello.greeting', { name: hostname }) : ''}</p>
	<p data-testid="hello-sdk" class="text-base-content/70 text-sm">sdk {host.sdkVersion}</p>
	<TextField
		label={t('hello.description')}
		uci="system.@system[0].description"
		testid="hello-description"
	/>
</Section>
