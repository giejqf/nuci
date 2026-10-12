<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Multi-choice from a fixed set of options, stored as a uci list. -->
<script lang="ts">
	import { asList, bindUci } from './binding.svelte';
	import type { SelectOption } from './types';

	interface Props {
		label: string;
		options: SelectOption[];
		uci?: string;
		values?: string[];
		description?: string;
		readonly?: boolean;
		testid?: string;
		/** Called with the new selection (also without uci binding). */
		onchange?: (values: string[]) => void;
	}
	let {
		label,
		options,
		uci,
		values = $bindable([]),
		description,
		readonly = false,
		testid,
		onchange,
	}: Props = $props();

	const binding = bindUci(() => uci);
	const selected = $derived(binding && uci ? asList(binding.value) : values);
	const locked = $derived(
		readonly || (binding && uci ? !binding.writable || !binding.ready : false),
	);

	function toggle(v: string, on: boolean) {
		const next = on ? [...selected, v] : selected.filter((x) => x !== v);
		const ordered = options.map((o) => o.value).filter((x) => next.includes(x));
		if (binding && uci) binding.set(ordered);
		else values = ordered;
		onchange?.(ordered);
	}
</script>

<fieldset class="fieldset" data-testid={testid}>
	<legend class="fieldset-legend">{label}</legend>
	<div class="flex flex-wrap gap-x-4 gap-y-1">
		{#each options as o (o.value)}
			<label class="label cursor-pointer gap-2">
				<input
					type="checkbox"
					class="checkbox checkbox-sm"
					checked={selected.includes(o.value)}
					disabled={locked}
					onchange={(e) => toggle(o.value, (e.currentTarget as HTMLInputElement).checked)}
				/>
				<span class="text-base-content">{o.label}</span>
			</label>
		{/each}
	</div>
	{#if description}<p class="label whitespace-normal">{description}</p>{/if}
</fieldset>
