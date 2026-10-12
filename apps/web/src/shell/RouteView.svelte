<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Loads the page chunk for a route; pages without read access render a notice. -->
<script lang="ts">
	import { ShieldAlert } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { session } from '../lib/session.svelte';
	import type { PageRoute } from '../router/routes';

	interface Props {
		route: PageRoute;
		params: Record<string, string>;
	}
	let { route, params }: Props = $props();
	const page = $derived(route.load());
</script>

{#if !session.canRead(route.acl)}
	<div role="alert" class="alert alert-warning">
		<ShieldAlert size={18} aria-hidden="true" />{t('rpc.error.permission_denied')}
	</div>
{:else}
	{#await page}
		<div class="flex justify-center p-8" role="status">
			<span class="loading loading-spinner" role="img" aria-label={t('ui.loading')}></span>
		</div>
	{:then mod}
		<mod.default {params} />
	{:catch e}
		<div role="alert" class="alert alert-error">
			{t('nav.load_failed')}: {String(e?.message ?? e)}
		</div>
	{/await}
{/if}
