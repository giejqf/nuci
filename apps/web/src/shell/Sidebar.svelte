<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Navigation grouped by area; entries the session cannot read are hidden. -->
<script lang="ts">
	import { ChevronDown, Router as RouterIcon, Search } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { appHost, pageTitle } from '../apps/host.svelte';
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

	let query = $state('');
	// Groups the user folded; kept for the browser (a convenience only).
	const FOLD_KEY = 'nuci.nav.folded';
	function loadFolded(): string[] {
		try {
			return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]') as string[];
		} catch {
			return [];
		}
	}
	let folded = $state<string[]>(loadFolded());
	function toggle(id: string) {
		folded = folded.includes(id) ? folded.filter((f) => f !== id) : [...folded, id];
		try {
			localStorage.setItem(FOLD_KEY, JSON.stringify(folded));
		} catch {
			// ignore
		}
	}

	const all = $derived(
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
							label: pageTitle(r.page),
							order: r.page.order ?? r.app.menu?.order ?? 100,
						})),
				].sort((a, b) => a.order - b.order);
				return { ...g, entries };
			})
			.filter((g) => g.entries.length),
	);
	const needle = $derived(query.trim().toLowerCase());
	const menu = $derived(
		needle
			? all
					.map((g) => ({
						...g,
						entries: g.entries.filter((e) =>
							`${e.label} ${t(g.title)}`.toLowerCase().includes(needle),
						),
					}))
					.filter((g) => g.entries.length)
			: all,
	);
	const active = (path: string) => router.path === path || router.path.startsWith(`${path}/`);
</script>

<aside class="bg-base-100 border-base-300 flex min-h-full w-64 flex-col border-r px-3 pt-4 pb-5">
	<a href="#/" class="flex items-center gap-2.5 px-2 pb-3.5">
		<RouterIcon size={22} class="text-primary shrink-0" aria-hidden="true" />
		<span class="flex min-w-0 flex-col leading-tight">
			<span class="font-bold">{t('app.name')}</span>
			<span class="text-base-content/70 truncate text-xs" data-testid="topbar-hostname"
				>{session.board?.hostname ?? ''}</span
			>
		</span>
	</a>
	<label class="relative mb-2 block">
		<span class="text-base-content/70 pointer-events-none absolute top-3 left-3 z-10"
			><Search size={16} aria-hidden="true" /></span
		>
		<input
			type="search"
			class="input w-full pl-9"
			placeholder={t('nav.search')}
			aria-label={t('nav.search')}
			bind:value={query}
			data-testid="nav-search"
		/>
	</label>
	<nav aria-label={t('nav.label')} class="flex-1 overflow-y-auto">
		<ul class="flex w-full flex-col gap-0.5" data-testid="sidebar">
			{#each menu as g (g.id)}
				{@const open = !!needle || !folded.includes(g.id)}
				<li>
					<h2>
						<button
							type="button"
							class="hover:bg-base-200 text-base-content/70 flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-semibold tracking-wide"
							aria-expanded={open}
							aria-controls="nav-{g.id}"
							onclick={() => toggle(g.id)}
						>
							<g.icon size={18} aria-hidden="true" />
							<span class="flex-1">{t(g.title)}</span>
							<ChevronDown
								size={16}
								aria-hidden="true"
								class="transition-transform {open ? '' : '-rotate-90'}"
							/>
						</button>
					</h2>
					<ul id="nav-{g.id}" class="flex flex-col gap-0.5" hidden={!open}>
						{#each g.entries as e (e.path)}
							<li>
								<a
									href="#/{e.path}"
									class="flex h-10 items-center rounded-lg pr-3 pl-10 text-sm {active(
										e.path,
									)
										? 'bg-primary/10 text-primary font-semibold'
										: 'hover:bg-base-200'}"
									aria-current={router.path === e.path ? 'page' : undefined}
									onclick={() => onnavigate?.()}>{e.label}</a
								>
							</li>
						{/each}
					</ul>
				</li>
			{:else}
				<li class="text-base-content/70 px-3 py-2 text-sm" data-testid="nav-empty">
					{t('nav.no_results', { query })}
				</li>
			{/each}
		</ul>
	</nav>
	{#if session.board}
		<p class="border-base-300 text-base-content/70 mt-3 truncate border-t px-2 pt-3 text-xs">
			{session.board.release.description}
		</p>
	{/if}
</aside>
