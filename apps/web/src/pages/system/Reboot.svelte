<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- System → Reboot -->
<script lang="ts">
	import { Power } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { isRpcError } from '@nuci/rpc';
	import { Modal, Page, Section, toasts } from '@nuci/ui';
	import { rpc, uci, waitForRestart } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	let confirm = $state(false);
	let phase = $state<'idle' | 'going-down' | 'down' | 'up' | 'timeout'>('idle');
	const canReboot = $derived(session.acl.canCall('system', 'reboot'));

	async function reboot() {
		confirm = false;
		try {
			await rpc.system.reboot();
		} catch (e) {
			toasts.error(isRpcError(e) ? t(e.messageKey) : String(e));
			return;
		}
		const back = await waitForRestart((p) => (phase = p));
		if (back) location.reload();
		else phase = 'timeout';
	}
</script>

<Page title={t('reboot.title')} description={t('reboot.description')} readonly={!canReboot}>
	<Section>
		{#if uci.totalChanges > 0}
			<div role="alert" class="alert alert-warning">
				{t('reboot.unsaved', { count: uci.totalChanges })}
			</div>
		{/if}
		{#if phase === 'idle'}
			<div>
				<button
					type="button"
					class="btn btn-error"
					disabled={!canReboot}
					onclick={() => (confirm = true)}
					data-testid="reboot"
				>
					<Power size={18} aria-hidden="true" />{t('reboot.button')}
				</button>
			</div>
		{:else}
			<div
				role="status"
				aria-live="polite"
				class="flex items-center gap-3"
				data-testid="reboot-status"
			>
				{#if phase !== 'timeout'}<span class="loading loading-spinner" aria-hidden="true"
					></span>{/if}
				{t(`reboot.phase.${phase}`)}
			</div>
		{/if}
	</Section>
</Page>

<Modal bind:open={confirm} title={t('reboot.title')}>
	<p>{t('reboot.confirm')}</p>
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (confirm = false)}
			>{t('ui.cancel')}</button
		>
		<button type="button" class="btn btn-error" onclick={reboot} data-testid="reboot-confirm"
			>{t('reboot.button')}</button
		>
	{/snippet}
</Modal>
