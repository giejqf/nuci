<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { X } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { toasts } from './toast.svelte';

	const cls = {
		info: 'alert-info',
		success: 'alert-success',
		warning: 'alert-warning',
		error: 'alert-error',
	};
</script>

<div class="toast toast-end toast-bottom z-50" aria-live="polite" aria-atomic="false">
	{#each toasts.items as toast (toast.id)}
		<div
			role={toast.kind === 'error' ? 'alert' : 'status'}
			class="alert {cls[toast.kind]} shadow-lg"
			data-testid="toast-{toast.kind}"
		>
			<span>{toast.message}</span>
			<button
				type="button"
				class="btn btn-ghost btn-xs btn-circle"
				aria-label={t('ui.dismiss')}
				onclick={() => toasts.dismiss(toast.id)}
			>
				<X size={14} aria-hidden="true" />
			</button>
		</div>
	{/each}
</div>
