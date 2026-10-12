<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { uid } from './form.svelte';

	interface Props {
		open?: boolean;
		title: string;
		/** Prevent closing with Esc/backdrop (e.g. while applying). */
		locked?: boolean;
		onclose?: () => void;
		actions?: Snippet;
		children: Snippet;
		testid?: string;
	}
	let {
		open = $bindable(false),
		title,
		locked = false,
		onclose,
		actions,
		children,
		testid,
	}: Props = $props();
	let dialog: HTMLDialogElement | undefined = $state();
	const titleId = uid('modal');

	$effect(() => {
		if (!dialog) return;
		// Fall back to the open attribute where showModal() is missing (old engines, jsdom).
		if (open && !dialog.open) {
			if (typeof dialog.showModal === 'function') dialog.showModal();
			else dialog.setAttribute('open', '');
		}
		if (!open && dialog.open) {
			if (typeof dialog.close === 'function') dialog.close();
			else dialog.removeAttribute('open');
		}
	});

	function close() {
		open = false;
		onclose?.();
	}
</script>

<dialog
	bind:this={dialog}
	class="modal"
	aria-labelledby={titleId}
	data-testid={testid}
	oncancel={(e) => {
		e.preventDefault();
		if (!locked) close();
	}}
>
	<div class="modal-box max-w-2xl">
		<h3 id={titleId} class="text-lg font-bold">{title}</h3>
		<div class="py-4">{@render children()}</div>
		{#if actions}<div class="modal-action">{@render actions()}</div>{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="button" tabindex="-1" aria-hidden="true" onclick={() => !locked && close()}
			>close</button
		>
	</form>
</dialog>
