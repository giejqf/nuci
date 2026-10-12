<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Groups fields; `valid` reflects every field's validator. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { FormState, forms, setFormContext } from './form.svelte';

	interface Props {
		valid?: boolean;
		onsubmit?: () => void;
		class?: string;
		children: Snippet;
	}
	let { valid = $bindable(true), onsubmit, class: klass = '', children }: Props = $props();

	const state = setFormContext(new FormState());
	$effect(() => forms.add(state));
	$effect(() => {
		if (valid !== state.valid) valid = state.valid;
	});
</script>

<form
	class={klass}
	novalidate
	onsubmit={(e) => {
		e.preventDefault();
		if (state.valid) onsubmit?.();
	}}
>
	{@render children()}
</form>
