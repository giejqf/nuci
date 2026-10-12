<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Editable list of strings, e.g. a uci `list server`. -->
<script lang="ts">
	import { Plus, X } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { asList, bindUci } from './binding.svelte';
	import { getFormContext, uid } from './form.svelte';
	import type { Validator } from './validators';

	interface Props {
		label: string;
		uci?: string;
		values?: string[];
		description?: string;
		placeholder?: string;
		validate?: Validator;
		readonly?: boolean;
		id?: string;
		testid?: string;
	}
	let {
		label,
		uci,
		values = $bindable([]),
		description,
		placeholder,
		validate,
		readonly = false,
		id = uid('list'),
		testid,
	}: Props = $props();

	const binding = bindUci(() => uci);
	const form = getFormContext();
	const items = $derived(binding && uci ? asList(binding.value) : values);
	const locked = $derived(
		readonly || (binding && uci ? !binding.writable || !binding.ready : false),
	);
	let draft = $state('');
	const draftError = $derived(draft && validate ? validate(draft) : null);
	const itemErrors = $derived(items.map((v) => (validate ? validate(v) : null)));

	$effect(() => {
		form?.report(id, itemErrors.find((e) => e) ?? null);
		return () => form?.report(id, null);
	});

	function write(next: string[]) {
		if (binding && uci) binding.set(next);
		else values = next;
	}

	function add() {
		const v = draft.trim();
		if (!v || draftError) return;
		write([...items, v]);
		draft = '';
	}
</script>

<fieldset class="fieldset" data-testid={testid}>
	<legend class="fieldset-legend">{label}</legend>
	<ul class="flex flex-col gap-1">
		{#each items as item, i (i)}
			<li class="join w-full">
				<input
					class="input join-item w-full"
					class:input-error={!!itemErrors[i]}
					value={item}
					readonly={locked}
					data-uci={uci}
					aria-label="{label} {i + 1}"
					onchange={(e) =>
						write(
							items.map((x, j) =>
								j === i ? (e.currentTarget as HTMLInputElement).value : x,
							),
						)}
				/>
				<button
					type="button"
					class="btn join-item"
					disabled={locked}
					aria-label={t('ui.list.remove', { item })}
					onclick={() => write(items.filter((_, j) => j !== i))}
				>
					<X size={16} aria-hidden="true" />
				</button>
			</li>
		{/each}
		{#if !locked}
			<li class="join w-full">
				<input
					{id}
					class="input join-item w-full"
					class:input-error={!!draftError}
					{placeholder}
					aria-label={t('ui.list.new', { label })}
					bind:value={draft}
					onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
				/>
				<button
					type="button"
					class="btn join-item"
					aria-label={t('ui.list.add')}
					disabled={!draft.trim() || !!draftError}
					onclick={add}
				>
					<Plus size={16} aria-hidden="true" />
				</button>
			</li>
		{/if}
	</ul>
	{#if draftError}
		<p class="label text-error" role="alert">{t(draftError)}</p>
	{:else if description}
		<p class="label whitespace-normal">{description}</p>
	{/if}
</fieldset>
