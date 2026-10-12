<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { uid } from './form.svelte';

	interface Props {
		title?: string;
		description?: string;
		actions?: Snippet;
		class?: string;
		testid?: string;
		children: Snippet;
	}
	let { title, description, actions, class: klass = '', testid, children }: Props = $props();
	const headingId = uid('section');
</script>

<section
	class="card bg-base-100 border-base-300 border shadow-sm {klass}"
	aria-labelledby={title ? headingId : undefined}
	data-testid={testid}
>
	<div class="card-body gap-3">
		{#if title || actions}
			<div class="flex items-center justify-between gap-2">
				{#if title}<h2 id={headingId} class="card-title text-lg">{title}</h2>{/if}
				{#if actions}<div class="flex gap-2">{@render actions()}</div>{/if}
			</div>
		{/if}
		{#if description}<p class="text-base-content/70 -mt-2 text-sm">{description}</p>{/if}
		{@render children()}
	</div>
</section>
