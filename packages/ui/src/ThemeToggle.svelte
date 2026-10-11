<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { Monitor, Moon, Sun } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { theme } from './theme.svelte';

	const label = $derived(
		t('theme.toggle') +
			': ' +
			t(
				theme.preference === 'system'
					? 'theme.system'
					: theme.preference === 'dark'
						? 'theme.dark'
						: 'theme.light',
			),
	);
</script>

<button
	type="button"
	class="btn btn-ghost btn-circle"
	aria-label={label}
	title={label}
	data-theme-preference={theme.preference}
	onclick={() => theme.cycle()}
>
	{#if theme.preference === 'system'}
		<Monitor size={20} aria-hidden="true" />
	{:else if theme.preference === 'dark'}
		<Moon size={20} aria-hidden="true" />
	{:else}
		<Sun size={20} aria-hidden="true" />
	{/if}
</button>
