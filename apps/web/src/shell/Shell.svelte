<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { ApplyBar, setNuciContext, Toaster } from '@nuci/ui';
	import { onMount } from 'svelte';
	import { appHost } from '../apps/host.svelte';
	import { probe, uci } from '../lib/services';
	import { session } from '../lib/session.svelte';
	import { router } from '../router/router.svelte';
	import { DEFAULT_PATH, routes } from '../router/routes';
	import AppPage from './AppPage.svelte';
	import Relogin from './Relogin.svelte';
	import RouteView from './RouteView.svelte';
	import Sidebar from './Sidebar.svelte';
	import Topbar from './Topbar.svelte';

	setNuciContext({
		uci,
		canWrite: (config) => session.canWriteUci(config),
		apply: { probe, timeout: 90 },
	});

	let drawer = $state(false);

	onMount(() => {
		if (!router.path) router.navigate(DEFAULT_PATH, true);
		void uci.refreshPending().catch(() => {});
		void appHost.load();
	});

	const match = $derived(router.match(routes));
	const appRoute = $derived(
		match ? null : appHost.routes.find((r) => r.page.path === router.path),
	);
	const title = $derived(match ? t(match.route.title) : appRoute?.page.title);

	$effect(() => {
		document.title = title
			? `${title} · ${session.board?.hostname ?? t('app.name')}`
			: t('app.name');
	});
</script>

<div class="drawer lg:drawer-open">
	<input id="nuci-drawer" type="checkbox" class="drawer-toggle" bind:checked={drawer} />
	<div class="drawer-content flex min-h-screen flex-col">
		<Topbar />
		<main class="flex-1 p-4 lg:p-6" id="main">
			{#if match}
				{#key match.route.path}
					<RouteView route={match.route} params={match.params} />
				{/key}
			{:else if appRoute}
				<AppPage route={appRoute} />
			{:else if router.path}
				<div role="alert" class="alert" data-testid="not-found">{t('nav.not_found')}</div>
			{/if}
		</main>
		<ApplyBar />
	</div>
	<div class="drawer-side z-30">
		<label for="nuci-drawer" class="drawer-overlay" aria-label={t('nav.close')}></label>
		<Sidebar onnavigate={() => (drawer = false)} />
	</div>
</div>
<Relogin />
<Toaster />
