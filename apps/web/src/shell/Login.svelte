<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { LogIn, Router } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { isRpcError } from '@nuci/rpc';
	import { ThemeToggle } from '@nuci/ui';
	import { session } from '../lib/session.svelte';

	interface Props {
		/** Re-login after session expiry: rendered inside a modal. */
		embedded?: boolean;
	}
	let { embedded = false }: Props = $props();

	let username = $state(session.username || 'root');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			await session.login(username, password);
			password = '';
		} catch (err) {
			error =
				isRpcError(err) && (err.isPermissionDenied || err.kind === 'session')
					? t('login.failed')
					: isRpcError(err)
						? t(err.messageKey)
						: t('rpc.error.network');
		} finally {
			busy = false;
		}
	}
</script>

{#snippet form()}
	<form class="flex flex-col gap-3" onsubmit={submit} data-testid="login-form">
		<fieldset class="fieldset">
			<label class="fieldset-legend" for="login-user">{t('login.username')}</label>
			<input
				id="login-user"
				class="input w-full"
				autocomplete="username"
				bind:value={username}
				required
			/>
		</fieldset>
		<fieldset class="fieldset">
			<label class="fieldset-legend" for="login-pass">{t('login.password')}</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="login-pass"
				class="input w-full"
				type="password"
				autocomplete="current-password"
				bind:value={password}
				autofocus
			/>
		</fieldset>
		{#if error}
			<div role="alert" class="alert alert-error alert-soft" data-testid="login-error">
				{error}
			</div>
		{/if}
		<button class="btn btn-primary mt-2" type="submit" disabled={busy || !username}>
			{#if busy}<span class="loading loading-spinner loading-sm" aria-hidden="true"
				></span>{:else}<LogIn size={18} aria-hidden="true" />{/if}
			{t('login.submit')}
		</button>
	</form>
{/snippet}

{#if embedded}
	{@render form()}
{:else}
	<main class="flex min-h-screen items-center justify-center p-4">
		<div class="absolute top-2 right-2"><ThemeToggle /></div>
		<div class="card bg-base-100 border-base-300 w-full max-w-sm border shadow-lg">
			<div class="card-body">
				<div class="mb-2 flex items-center gap-3">
					<Router size={32} class="text-primary" aria-hidden="true" />
					<div>
						<h1 class="text-xl font-semibold">
							{session.board?.hostname ?? t('app.name')}
						</h1>
						<p class="text-base-content/60 text-sm" data-testid="login-model">
							{session.board
								? `${session.board.model} · ${session.board.release.description}`
								: t('login.title')}
						</p>
					</div>
				</div>
				{@render form()}
			</div>
		</div>
	</main>
{/if}
