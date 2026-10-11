<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { Router } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { ThemeToggle } from '@nuci/ui';
</script>

<div class="navbar bg-base-100 shadow-sm">
	<div class="flex-1 gap-2 px-2">
		<Router size={24} aria-hidden="true" />
		<span class="text-xl font-semibold">{t('app.name')}</span>
	</div>
	<ThemeToggle />
</div>

<main class="hero min-h-[60vh]">
	<div class="hero-content text-center">
		<div>
			<h1 class="text-4xl font-bold">{t('app.name')}</h1>
			<p class="py-4 opacity-70" data-testid="tagline">{t('app.tagline')}</p>
		</div>
	</div>
</main>
