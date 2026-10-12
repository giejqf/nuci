<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	Sticky bar for unsaved changes: review, revert, save, save & apply.
	Apply runs the rollback protocol (ADR-0002) and announces progress.
-->
<script lang="ts">
	import { CircleCheck, Undo2, ListChecks, Save, LoaderCircle } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { applyStaged } from './apply';
	import ChangeList from './ChangeList.svelte';
	import { getNuciContext, hostStore } from './context';
	import { forms } from './form.svelte';
	import Modal from './Modal.svelte';
	import { toasts } from './toast.svelte';

	const ctx = getNuciContext();
	const uci = hostStore(ctx);
	let reviewing = $state(false);
	let saving = $state(false);

	// The bar outlives pages: a route change (e.g. browser back) closes the review.
	$effect(() => {
		const close = () => (reviewing = false);
		window.addEventListener('hashchange', close);
		return () => window.removeEventListener('hashchange', close);
	});

	const count = $derived(uci.totalChanges);
	const phase = $derived(uci.apply.phase);
	const busy = $derived(uci.busy || saving);
	const visible = $derived(count > 0 || uci.busy);
	const canSave = $derived(forms.valid && !busy);

	const status = $derived.by(() => {
		switch (phase) {
			case 'saving':
				return t('ui.apply.saving');
			case 'applying':
				return t('ui.apply.applying');
			case 'confirming':
				return uci.apply.remaining
					? t('ui.apply.confirming', { seconds: uci.apply.remaining })
					: t('ui.apply.waiting');
			default:
				return '';
		}
	});

	async function save() {
		saving = true;
		try {
			await uci.save();
			toasts.success(t('ui.apply.saved'));
		} catch (e) {
			toasts.error(t('ui.apply.save_failed', { error: String((e as Error)?.message ?? e) }));
		} finally {
			saving = false;
		}
	}

	async function apply(rollback = true) {
		reviewing = false;
		await applyStaged(ctx, rollback);
	}

	async function revert() {
		reviewing = false;
		uci.revertLocal();
		try {
			if (uci.pendingCount) await uci.revertPending();
			toasts.info(t('ui.apply.reverted'));
		} catch (e) {
			toasts.error(String((e as Error)?.message ?? e));
		}
	}
</script>

{#if visible}
	<div
		class="bg-base-100 border-base-300 sticky bottom-0 z-30 flex flex-wrap items-center gap-2 border-t px-4 py-2 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
		data-testid="apply-bar"
	>
		<div class="flex-1" aria-live="polite" aria-atomic="true" data-testid="apply-status">
			{#if busy}
				<span class="inline-flex items-center gap-2">
					<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />
					{status}
				</span>
				{#if phase === 'confirming' && uci.apply.remaining}
					<progress
						class="progress progress-warning ml-2 w-32 align-middle"
						value={uci.apply.remaining}
						max={ctx.apply?.timeout ?? 90}
					></progress>
				{/if}
			{:else}
				<button
					type="button"
					class="link"
					data-testid="apply-review"
					onclick={() => (reviewing = true)}
				>
					{t('ui.apply.count', { count })}
				</button>
			{/if}
		</div>
		<button
			type="button"
			class="btn btn-ghost btn-sm"
			disabled={busy}
			onclick={() => (reviewing = true)}
		>
			<ListChecks size={16} aria-hidden="true" />{t('ui.apply.review')}
		</button>
		<button
			type="button"
			class="btn btn-ghost btn-sm"
			disabled={busy}
			data-testid="apply-revert"
			onclick={revert}
		>
			<Undo2 size={16} aria-hidden="true" />{t('ui.apply.revert')}
		</button>
		<button
			type="button"
			class="btn btn-sm"
			disabled={!canSave || !uci.dirty}
			data-testid="apply-save"
			onclick={save}
		>
			<Save size={16} aria-hidden="true" />{t('ui.apply.save')}
		</button>
		<button
			type="button"
			class="btn btn-primary btn-sm"
			disabled={!canSave || !ctx.apply}
			data-testid="apply-apply"
			onclick={() => apply(true)}
		>
			<CircleCheck size={16} aria-hidden="true" />{t('ui.apply.apply')}
		</button>
	</div>
{/if}

<Modal bind:open={reviewing} title={t('ui.changes.title')} testid="apply-review-modal">
	<ChangeList changes={uci.changes} pending={uci.pending} />
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (reviewing = false)}
			>{t('ui.close')}</button
		>
		<button
			type="button"
			class="btn btn-warning btn-outline"
			disabled={!canSave}
			data-testid="apply-unchecked"
			onclick={() => apply(false)}
		>
			{t('ui.apply.unchecked')}
		</button>
		<button
			type="button"
			class="btn btn-primary"
			disabled={!canSave || !ctx.apply}
			onclick={() => apply(true)}
		>
			{t('ui.apply.apply')}
		</button>
	{/snippet}
</Modal>
