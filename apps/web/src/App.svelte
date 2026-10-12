<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { isRpcError } from '@nuci/rpc';
	import { toasts } from '@nuci/ui';
	import { onMount } from 'svelte';
	import { HANDOFF_RE } from './lib/handoff';
	import { rpc } from './lib/services';
	import { session } from './lib/session.svelte';

	// Arriving from an address handoff: adopt the session and confirm the apply
	// here, then drop the session id from the URL (ADR-0002 §6).
	async function adoptHandoff(): Promise<void> {
		const sid = HANDOFF_RE.exec(location.hash)?.[1];
		if (!sid) return;
		history.replaceState(null, '', `${location.pathname}#/`);
		rpc.client.setSession(sid);
		try {
			await rpc.uci.confirm();
			toasts.success(t('handoff.confirmed'));
		} catch (e) {
			toasts.error(
				isRpcError(e) && e.code === 5 ? t('handoff.too_late') : t('handoff.failed'),
			);
		}
	}
	import Login from './shell/Login.svelte';
	import Shell from './shell/Shell.svelte';

	onMount(() => {
		void adoptHandoff().then(() => session.init());
	});
</script>

{#if !session.ready}
	<div class="flex min-h-screen items-center justify-center" role="status">
		<span class="loading loading-spinner loading-lg" aria-label={t('ui.loading')}></span>
	</div>
{:else if session.authenticated}
	<Shell />
{:else}
	<Login />
{/if}
