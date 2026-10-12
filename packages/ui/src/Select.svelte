<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { asString, bindUci } from './binding.svelte';
	import Field from './Field.svelte';
	import { uid } from './form.svelte';
	import type { SelectOption } from './types';

	interface Props {
		label: string;
		options: SelectOption[];
		uci?: string;
		value?: string;
		description?: string;
		/** Value written when the option is unset in uci. */
		placeholder?: string;
		readonly?: boolean;
		id?: string;
		testid?: string;
		onchange?: (value: string) => void;
	}
	let {
		label,
		options,
		uci,
		value = $bindable(''),
		description,
		placeholder,
		readonly = false,
		id = uid('select'),
		testid,
		onchange,
	}: Props = $props();

	const binding = bindUci(() => uci);
	const current = $derived(binding && uci ? asString(binding.value) : value);
	const locked = $derived(
		readonly || (binding && uci ? !binding.writable || !binding.ready : false),
	);

	function change(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		if (binding && uci) binding.set(v);
		else value = v;
		onchange?.(v);
	}
</script>

<Field {id} {label} {description}>
	<select
		{id}
		class="select w-full"
		value={current}
		disabled={locked}
		data-uci={uci}
		data-testid={testid}
		onchange={change}
	>
		{#if placeholder !== undefined && !options.some((o) => o.value === current)}
			<option value={current} disabled>{placeholder}</option>
		{/if}
		{#each options as o (o.value)}
			<option value={o.value}>{o.label}</option>
		{/each}
	</select>
</Field>
