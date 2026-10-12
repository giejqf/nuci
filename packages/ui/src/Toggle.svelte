<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Boolean uci flag. Returning to the default when the option was unset unsets it again. -->
<script lang="ts">
	import { asString, bindUci } from './binding.svelte';
	import { uid } from './form.svelte';

	interface Props {
		label: string;
		uci?: string;
		checked?: boolean;
		description?: string;
		/** Value stored when on / off (default '1' / '0'). */
		on?: string;
		off?: string;
		/** Meaning of an unset option. */
		default?: boolean;
		readonly?: boolean;
		id?: string;
		testid?: string;
	}
	let {
		label,
		uci,
		checked = $bindable(false),
		description,
		on = '1',
		off = '0',
		default: dflt = false,
		readonly = false,
		id = uid('toggle'),
		testid,
	}: Props = $props();

	const binding = bindUci(() => uci);
	const raw = $derived(binding && uci ? binding.value : undefined);
	const current = $derived(
		binding && uci
			? raw === undefined
				? dflt
				: asString(raw) === on || asString(raw) === 'true'
			: checked,
	);
	const locked = $derived(
		readonly || (binding && uci ? !binding.writable || !binding.ready : false),
	);

	function toggle(e: Event) {
		const next = (e.currentTarget as HTMLInputElement).checked;
		if (binding && uci) {
			binding.set(next === dflt && binding.baseValue === undefined ? null : next ? on : off);
		} else {
			checked = next;
		}
	}
</script>

<fieldset class="fieldset">
	<label class="label cursor-pointer gap-3" for={id}>
		<input
			{id}
			type="checkbox"
			class="toggle"
			checked={current}
			disabled={locked}
			data-uci={uci}
			data-testid={testid}
			onchange={toggle}
		/>
		<span class="text-base-content">{label}</span>
	</label>
	{#if description}<p class="label whitespace-normal">{description}</p>{/if}
</fieldset>
