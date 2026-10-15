<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { LogOut, Menu } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { ThemeToggle } from '@nuci/ui';
	import { appHost, pageTitle } from '../apps/host.svelte';
	import LanguageSelect from './LanguageSelect.svelte';
	import { session } from '../lib/session.svelte';
	import { uci } from '../lib/services';
	import { router } from '../router/router.svelte';
	import { groups, routes } from '../router/routes';

	// "Group / Page" for the current route (core pages and app pages alike).
	const crumbs = $derived.by(() => {
		const m = router.match(routes);
		const app = m ? null : appHost.routes.find((r) => r.page.path === router.path);
		const group = m?.route.group ?? app?.page.group;
		const page = m ? t(m.route.title) : app ? pageTitle(app.page) : '';
		const g = groups.find((x) => x.id === group);
		return [g ? t(g.title) : '', page].filter(Boolean);
	});
</script>

<header
	class="bg-base-100 border-base-300 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-2 lg:px-6"
>
	<label for="nuci-drawer" class="btn btn-ghost btn-square lg:hidden" aria-label={t('nav.open')}>
		<Menu size={20} aria-hidden="true" />
	</label>
	<nav class="min-w-0 flex-1 truncate px-2 text-sm" aria-label={t('nav.breadcrumb')}>
		<ol class="flex items-center gap-2">
			{#each crumbs as c, i (i)}
				{#if i > 0}<li class="text-base-content/50 hidden sm:block" aria-hidden="true">
						/
					</li>{/if}
				<li
					class="truncate {i === crumbs.length - 1
						? 'font-medium'
						: 'text-base-content/70 hidden sm:block'}"
					aria-current={i === crumbs.length - 1 ? 'page' : undefined}
				>
					{c}
				</li>
			{/each}
		</ol>
	</nav>
	<div class="flex flex-none items-center gap-1">
		{#if uci.totalChanges > 0}
			<span class="badge badge-warning badge-soft" data-testid="unsaved-badge"
				>{t('ui.apply.count', { count: uci.totalChanges })}</span
			>
		{/if}
		<LanguageSelect />
		<ThemeToggle />
		<span class="text-base-content/70 hidden px-2 text-sm sm:inline" data-testid="topbar-user"
			>{session.username}</span
		>
		<button
			type="button"
			class="btn btn-ghost btn-square"
			data-testid="logout"
			aria-label={t('login.logout')}
			title={t('login.logout')}
			onclick={() => session.logout()}
		>
			<LogOut size={18} aria-hidden="true" />
		</button>
	</div>
</header>
