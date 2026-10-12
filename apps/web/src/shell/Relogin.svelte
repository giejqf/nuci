<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { Modal } from '@nuci/ui';
	import { session } from '../lib/session.svelte';
	import Login from './Login.svelte';

	let open = $derived(session.expired);
</script>

<Modal bind:open title={t('login.expired')} locked testid="relogin">
	<p class="text-base-content/70 mb-3 text-sm">{t('rpc.error.session_expired')}</p>
	<Login embedded />
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => session.cancelRelogin()}
			>{t('login.logout')}</button
		>
	{/snippet}
</Modal>
