<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Mounts a nuci-app page into its own element (see @nuci/app-sdk). -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import type { AppRoute } from '../apps/host.svelte';
	import { appHost } from '../apps/host.svelte';

	interface Props {
		route: AppRoute;
	}
	let { route }: Props = $props();
	let error = $state('');

	function mountApp(node: HTMLElement) {
		let unmount: (() => void) | void;
		let gone = false;
		Promise.resolve(route.page.mount(node, appHost.context()))
			.then((u) => {
				if (gone) u?.();
				else unmount = u;
			})
			.catch((e) => (error = String(e?.message ?? e)));
		return () => {
			gone = true;
			unmount?.();
		};
	}
</script>

<section class="flex flex-col gap-4" aria-labelledby="app-title">
	<h1 id="app-title" class="text-2xl font-semibold">{route.page.title}</h1>
	{#if error}<div role="alert" class="alert alert-error">
			{t('nav.load_failed')}: {error}
		</div>{/if}
	{#key route.page.path}
		<div data-app={route.app.id} {@attach mountApp}></div>
	{/key}
</section>
