<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- WAI-ARIA tabs; arrow keys move between tabs. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { uid } from './form.svelte';

	interface Tab {
		id: string;
		label: string;
	}
	interface Props {
		tabs: Tab[];
		active?: string;
		children: Snippet<[string]>;
	}
	let { tabs, active = $bindable(tabs[0]?.id ?? ''), children }: Props = $props();
	const base = uid('tabs');
	let buttons: HTMLButtonElement[] = $state([]);

	function key(e: KeyboardEvent, i: number) {
		const n = tabs.length;
		const j =
			e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : -1;
		if (j < 0) return;
		e.preventDefault();
		active = tabs[j]!.id;
		buttons[j]?.focus();
	}
</script>

<div role="tablist" class="tabs tabs-border">
	{#each tabs as tab, i (tab.id)}
		<button
			bind:this={buttons[i]}
			type="button"
			role="tab"
			id="{base}-{tab.id}"
			class="tab"
			class:tab-active={active === tab.id}
			aria-selected={active === tab.id}
			aria-controls="{base}-panel"
			tabindex={active === tab.id ? 0 : -1}
			onclick={() => (active = tab.id)}
			onkeydown={(e) => key(e, i)}
		>
			{tab.label}
		</button>
	{/each}
</div>
<div role="tabpanel" id="{base}-panel" aria-labelledby="{base}-{active}" class="pt-4">
	{@render children(active)}
</div>
