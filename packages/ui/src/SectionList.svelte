<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Table of uci sections of one type with add / edit (in a modal) / delete.
	Everything is staged through the uci store; cancelling a new entry
	discards it. `editor` renders the fields for a section name.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Eye, Pencil, Plus, Trash2 } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import type { UciValue } from '@nuci/uci';
	import { asString } from './binding.svelte';
	import { getNuciContext } from './context';
	import Form from './Form.svelte';
	import Modal from './Modal.svelte';

	interface Column {
		option: string;
		/** Unique key when two columns read the same option. */
		key?: string;
		label: string;
		format?: (value: UciValue | undefined, section: string) => string;
	}

	interface Props {
		config: string;
		type: string;
		columns: Column[];
		editor: Snippet<[string]>;
		/** Extra buttons per row (before edit and delete). */
		rowActions?: Snippet<[string]>;
		/** Values for a new section (e.g. defaults). */
		defaults?: Record<string, UciValue>;
		addLabel?: string;
		editTitle?: string;
		empty?: string;
		/** Hide sections (e.g. ones managed elsewhere). */
		filter?: (section: string) => boolean;
		testid?: string;
	}
	let {
		config,
		type,
		columns,
		editor,
		rowActions,
		defaults,
		addLabel,
		editTitle,
		empty,
		filter,
		testid,
	}: Props = $props();

	const ctx = getNuciContext();
	const uci = ctx.uci;
	let editing = $state<string | null>(null);
	let isNew = $state(false);
	let open = $state(false);
	let valid = $state(true);
	let form = $state<{ reveal(): boolean }>();

	const writable = $derived(ctx.canWrite?.(config) ?? true);
	const rows = $derived(uci.sections(config, type).filter((s) => !filter || filter(s['.name'])));

	// A new entry is a draft until Done: the dialog stages nothing before.
	function add() {
		editing = uci.add(config, type, undefined, defaults ?? {}, { draft: true });
		isNew = true;
		open = true;
	}

	function done() {
		if (form && !form.reveal()) return;
		if (isNew && editing) uci.confirmDraft?.(config, editing);
		close();
	}

	// Leaving the page with the dialog open discards the draft.
	$effect(() => () => {
		if (isNew && editing) uci.remove(config, editing);
	});

	function edit(name: string) {
		editing = name;
		isNew = false;
		open = true;
	}

	function cancel() {
		if (isNew && editing) uci.remove(config, editing);
		close();
	}

	function close() {
		open = false;
		editing = null;
		isNew = false;
	}

	function cell(c: Column, name: string): string {
		const v = uci.get(config, name, c.option);
		return c.format ? c.format(v, name) : asString(v) || '—';
	}
</script>

<div class="flex flex-col gap-2" data-testid={testid}>
	<div class="overflow-x-auto">
		<table class="table-sm nuci-stack table">
			<thead>
				<tr>
					{#each columns as c (c.key ?? c.option)}<th>{c.label}</th>{/each}
					<th class="text-right"><span class="sr-only">{t('ui.actions')}</span></th>
				</tr>
			</thead>
			<tbody>
				{#each rows as s (s['.name'])}
					<tr data-section={s['.name']}>
						{#each columns as c (c.key ?? c.option)}<td
								class="font-mono text-xs"
								data-label={c.label}>{cell(c, s['.name'])}</td
							>{/each}
						<td class="text-right whitespace-nowrap">
							{@render rowActions?.(s['.name'])}
							<button
								type="button"
								class="btn btn-ghost btn-xs"
								aria-label={t(writable ? 'ui.edit_entry' : 'ui.view_entry', {
									name: cell(columns[0]!, s['.name']),
								})}
								onclick={() => edit(s['.name'])}
							>
								{#if writable}<Pencil size={14} aria-hidden="true" />{:else}<Eye
										size={14}
										aria-hidden="true"
									/>{/if}
							</button>
							{#if writable}
								<button
									type="button"
									class="btn btn-ghost btn-xs"
									aria-label={t('ui.delete_entry', {
										name: cell(columns[0]!, s['.name']),
									})}
									onclick={() => uci.remove(config, s['.name'])}
								>
									<Trash2 size={14} aria-hidden="true" />
								</button>
							{/if}
						</td>
					</tr>
				{:else}
					<tr
						><td
							colspan={columns.length + 1}
							class="text-base-content/70 py-4 text-center"
							>{empty ?? t('ui.table.empty')}</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>
	{#if writable}
		<div>
			<button
				type="button"
				class="btn btn-sm"
				onclick={add}
				data-testid={testid ? `${testid}-add` : undefined}
			>
				<Plus size={16} aria-hidden="true" />{addLabel ?? t('ui.add')}
			</button>
		</div>
	{/if}
</div>

<Modal
	bind:open
	title={editTitle ?? t('ui.edit')}
	onclose={cancel}
	testid={testid ? `${testid}-editor` : undefined}
>
	{#if editing}
		<Form bind:valid bind:this={form}>
			{@render editor(editing)}
		</Form>
	{/if}
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={cancel}
			>{isNew ? t('ui.cancel') : t('ui.close')}</button
		>
		<button
			type="button"
			class="btn btn-primary"
			onclick={done}
			data-testid={testid ? `${testid}-done` : undefined}>{t('ui.done')}</button
		>
	{/snippet}
</Modal>
