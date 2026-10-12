<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { onMount } from 'svelte';
	import { session } from './lib/session.svelte';
	import Login from './shell/Login.svelte';
	import Shell from './shell/Shell.svelte';

	onMount(() => {
		void session.init();
	});
</script>

{#if !session.ready}
	<div class="flex min-h-screen items-center justify-center" role="status">
		<span class="loading loading-spinner loading-lg" aria-label={t('ui.loading')}></span>
	</div>
{:else if session.authenticated}
	<Shell />
{:else}
	<Login />
{/if}
