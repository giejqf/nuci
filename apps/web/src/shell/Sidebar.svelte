<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Navigation grouped by area; entries the session cannot read are hidden. -->
<script lang="ts">
	import { Router as RouterIcon } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { appHost } from '../apps/host.svelte';
	import { session } from '../lib/session.svelte';
	import { router } from '../router/router.svelte';
	import { groups, routes } from '../router/routes';

	interface Props {
		onnavigate?: () => void;
	}
	let { onnavigate }: Props = $props();

	interface Entry {
		path: string;
		label: string;
		order: number;
	}

	const menu = $derived(
		groups
			.map((g) => {
				const entries: Entry[] = [
					...routes
						.filter((r) => r.group === g.id && !r.hidden && session.canRead(r.acl))
						.map((r) => ({ path: r.path, label: t(r.title), order: r.order })),
					...appHost.routes
						.filter(
							(r) =>
								r.page.group === g.id &&
								(!r.page.acl || session.canRead(r.page.acl)),
						)
						.map((r) => ({
							path: r.page.path,
							label: r.page.title,
							order: r.page.order ?? r.app.menu?.order ?? 100,
						})),
				].sort((a, b) => a.order - b.order);
				return { ...g, entries };
			})
			.filter((g) => g.entries.length),
	);
</script>

<aside class="bg-base-100 border-base-300 flex min-h-full w-64 flex-col border-r">
	<a href="#/" class="flex items-center gap-2 px-4 py-4 text-lg font-semibold">
		<RouterIcon size={24} class="text-primary" aria-hidden="true" />
		{t('app.name')}
	</a>
	<nav aria-label={t('nav.label')}>
		<ul class="menu w-full gap-1" data-testid="sidebar">
			{#each menu as g (g.id)}
				<li>
					<h2 class="menu-title text-base-content/70 flex items-center gap-2">
						<g.icon size={16} aria-hidden="true" />{t(g.title)}
					</h2>
					<ul>
						{#each g.entries as e (e.path)}
							<li>
								<a
									href="#/{e.path}"
									class:menu-active={router.path === e.path ||
										router.path.startsWith(`${e.path}/`)}
									aria-current={router.path === e.path ? 'page' : undefined}
									onclick={() => onnavigate?.()}>{e.label}</a
								>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ul>
	</nav>
</aside>
