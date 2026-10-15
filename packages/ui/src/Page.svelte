<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Lock } from '@lucide/svelte';
	import { t } from '@nuci/i18n';

	interface Props {
		title: string;
		description?: string;
		/** Render read-only with an explanation (permission denied). */
		readonly?: boolean;
		actions?: Snippet;
		children: Snippet;
	}
	let { title, description, readonly = false, actions, children }: Props = $props();
</script>

<section class="mx-auto flex w-full max-w-6xl flex-col gap-5" aria-labelledby="page-title">
	<header class="flex flex-wrap items-start justify-between gap-2">
		<div>
			<h1 id="page-title" class="text-3xl font-medium tracking-tight">{title}</h1>
			{#if description}<p class="text-base-content/70 mt-1 text-sm">{description}</p>{/if}
		</div>
		{#if actions}<div class="flex gap-2">{@render actions()}</div>{/if}
	</header>
	{#if readonly}
		<div role="status" class="alert alert-info alert-soft">
			<Lock size={18} aria-hidden="true" />
			<span>{t('ui.readonly')}</span>
		</div>
	{/if}
	{@render children()}
</section>
