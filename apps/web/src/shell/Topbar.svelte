<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { LogOut, Menu } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { ThemeToggle } from '@nuci/ui';
	import LanguageSelect from './LanguageSelect.svelte';
	import { session } from '../lib/session.svelte';
	import { uci } from '../lib/services';
</script>

<header class="navbar bg-base-100 border-base-300 sticky top-0 z-20 border-b px-2">
	<div class="flex-none lg:hidden">
		<label for="nuci-drawer" class="btn btn-ghost btn-square" aria-label={t('nav.open')}>
			<Menu size={20} aria-hidden="true" />
		</label>
	</div>
	<div class="flex-1 px-2">
		<span class="font-semibold" data-testid="topbar-hostname"
			>{session.board?.hostname ?? ''}</span
		>
		{#if session.board}
			<span class="text-base-content/60 ml-2 hidden text-sm sm:inline"
				>{session.board.release.description}</span
			>
		{/if}
	</div>
	<div class="flex flex-none items-center gap-1">
		{#if uci.totalChanges > 0}
			<span class="badge badge-warning" data-testid="unsaved-badge"
				>{t('ui.apply.count', { count: uci.totalChanges })}</span
			>
		{/if}
		<LanguageSelect />
		<ThemeToggle />
		<button
			type="button"
			class="btn btn-ghost btn-sm"
			data-testid="logout"
			onclick={() => session.logout()}
		>
			<LogOut size={18} aria-hidden="true" />
			<span class="hidden sm:inline">{t('login.logout')}</span>
		</button>
	</div>
</header>
