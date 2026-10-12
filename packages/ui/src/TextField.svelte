<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Text input, optionally bound to a uci option: <TextField uci="network.lan.ipaddr" />.
	Without `uci`, use bind:value.
-->
<script lang="ts">
	import { asString, bindUci } from './binding.svelte';
	import Field from './Field.svelte';
	import { getFormContext, uid } from './form.svelte';
	import type { Validator } from './validators';

	interface Props {
		label: string;
		uci?: string;
		value?: string;
		description?: string;
		placeholder?: string;
		type?: 'text' | 'password' | 'number' | 'email' | 'url';
		validate?: Validator;
		readonly?: boolean;
		autocomplete?: HTMLInputElement['autocomplete'];
		id?: string;
		testid?: string;
	}
	let {
		label,
		uci,
		value = $bindable(''),
		description,
		placeholder,
		type = 'text',
		validate,
		readonly = false,
		autocomplete,
		id = uid('field'),
		testid,
	}: Props = $props();

	const binding = bindUci(() => uci);
	const form = getFormContext();
	let touched = $state(false);

	const current = $derived(binding && uci ? asString(binding.value) : value);
	const error = $derived(validate ? validate(current) : null);
	const locked = $derived(
		readonly || (binding && uci ? !binding.writable || !binding.ready : false),
	);

	$effect(() => {
		form?.report(id, error);
		return () => form?.report(id, null);
	});

	function oninput(e: Event) {
		const v = (e.currentTarget as HTMLInputElement).value;
		touched = true;
		if (binding && uci) binding.set(v);
		else value = v;
	}
</script>

<Field {id} {label} {description} error={touched || current !== '' ? error : null}>
	<input
		{id}
		class="input w-full"
		class:input-error={!!error && (touched || current !== '')}
		{type}
		{placeholder}
		{autocomplete}
		value={current}
		readonly={locked}
		aria-invalid={!!error}
		aria-describedby={error ? `${id}-error` : description ? `${id}-desc` : undefined}
		data-testid={testid}
		{oninput}
		onblur={() => (touched = true)}
	/>
</Field>
