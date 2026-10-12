<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Label/value row for status cards. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	interface Props {
		label: string;
		value?: string | number | null;
		testid?: string;
		children?: Snippet;
	}
	let { label, value, testid, children }: Props = $props();
</script>

<div class="flex justify-between gap-4 py-1 text-sm">
	<dt class="text-base-content/70 shrink-0">{label}</dt>
	<dd class="min-w-0 text-right font-medium break-words" data-testid={testid}>
		{#if children}{@render children()}{:else}{value ?? '—'}{/if}
	</dd>
</div>
