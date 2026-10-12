<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { ApplyBar, setNuciContext, Toaster } from '@nuci/ui';
	import { onMount } from 'svelte';
	import { appHost } from '../apps/host.svelte';
	import { browserAddress, configuredAddresses, handoffTarget, handoffUrl } from '../lib/handoff';
	import { probe, rpc, uci } from '../lib/services';
	import { session } from '../lib/session.svelte';
	import { router } from '../router/router.svelte';
	import { DEFAULT_PATH, routes } from '../router/routes';
	import AppPage from './AppPage.svelte';
	import Relogin from './Relogin.svelte';
	import RouteView from './RouteView.svelte';
	import Sidebar from './Sidebar.svelte';
	import Topbar from './Topbar.svelte';

	// Address handoff (ADR-0002 §6): set while an apply moves the browser's address.
	let handoff = $state<{ host: string; url: string; reachable: boolean } | null>(null);

	async function prepare() {
		const host = browserAddress(location.hostname);
		if (!host) return {};
		let liveIface: string | null = null;
		try {
			liveIface =
				(await rpc.network.interfaces()).find((i) =>
					(i['ipv4-address'] ?? []).some((a) => a.address === host),
				)?.interface ?? null;
		} catch {
			return {};
		}
		const target = handoffTarget(host, liveIface, configuredAddresses(uci));
		if (!target) return {};
		const state = {
			host: target,
			url: handoffUrl(target, rpc.client.sid, location),
			reachable: false,
		};
		handoff = state;
		const port = location.port ? `:${location.port}` : '';
		return {
			probe: async () => {
				if (await probe()) return true;
				try {
					const r = await fetch(`${location.protocol}//${target}${port}/nuci/probe`, {
						cache: 'no-store',
						signal: AbortSignal.timeout(2000),
					});
					if (handoff)
						handoff.reachable =
							r.ok && ((await r.json()) as { ok?: boolean }).ok === true;
				} catch {
					if (handoff) handoff.reachable = false;
				}
				return false;
			},
		};
	}

	setNuciContext({
		uci,
		canWrite: (config) => session.canWriteUci(config),
		apply: { probe, timeout: 90, prepare, done: () => (handoff = null) },
	});

	let drawer = $state(false);

	onMount(() => {
		// Pages never see the transport; expose it on <html> for diagnostics and e2e.
		const offTransport = rpc.events.onTransportChange(
			(tr) => (document.documentElement.dataset.transport = tr),
		);
		if (!router.path) router.navigate(DEFAULT_PATH, true);
		void uci.refreshPending().catch(() => {});
		void appHost.load();
		return offTransport;
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
		{#if handoff}
			<div
				role="status"
				aria-live="polite"
				class="alert alert-info mx-4 mb-2"
				data-testid="handoff"
			>
				<span
					>{handoff.reachable
						? t('handoff.ready', { host: handoff.host })
						: t('handoff.waiting', { host: handoff.host })}</span
				>
				{#if handoff.reachable}<a class="btn btn-sm btn-primary" href={handoff.url}
						>{t('handoff.continue')}</a
					>{/if}
			</div>
		{/if}
		<ApplyBar />
	</div>
	<div class="drawer-side z-30">
		<label for="nuci-drawer" class="drawer-overlay" aria-label={t('nav.close')}></label>
		<Sidebar onnavigate={() => (drawer = false)} />
	</div>
</div>
<Relogin />
<Toaster />
