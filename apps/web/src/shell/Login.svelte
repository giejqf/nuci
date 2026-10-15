<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { Eye, EyeOff, LogIn, Router } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { isRpcError } from '@nuci/rpc';
	import { ThemeToggle } from '@nuci/ui';
	import LanguageSelect from './LanguageSelect.svelte';
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
	let reveal = $state(false);

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
			<div class="relative">
				<!-- svelte-ignore a11y_autofocus -->
				<input
					id="login-pass"
					class="input w-full pr-12"
					type={reveal ? 'text' : 'password'}
					autocomplete="current-password"
					bind:value={password}
					autofocus
				/>
				<button
					type="button"
					class="btn btn-ghost btn-square btn-sm absolute top-1 right-1"
					aria-label={reveal ? t('login.hide') : t('login.show')}
					aria-pressed={reveal}
					onclick={() => (reveal = !reveal)}
				>
					{#if reveal}<EyeOff size={18} aria-hidden="true" />{:else}<Eye
							size={18}
							aria-hidden="true"
						/>{/if}
				</button>
			</div>
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
		<div class="absolute top-3 right-3 flex items-center gap-1">
			<LanguageSelect /><ThemeToggle />
		</div>
		<div class="w-full max-w-sm">
			<div class="mb-6 flex flex-col items-center gap-1 text-center">
				<span
					class="bg-base-100 border-base-300 text-primary mb-3 flex size-16 items-center justify-center rounded-2xl border"
					><Router size={32} aria-hidden="true" /></span
				>
				<h1 class="text-2xl font-medium">
					{session.board?.hostname ?? t('app.name')}
				</h1>
				<p class="text-base-content/70 text-sm" data-testid="login-model">
					{session.board
						? `${session.board.model} · ${session.board.release.description}`
						: t('login.title')}
				</p>
			</div>
			<div class="card bg-base-100 border-base-300 border">
				<div class="card-body p-5">
					{@render form()}
				</div>
			</div>
			<p class="text-base-content/70 mt-6 text-center text-xs">{t('login.local_note')}</p>
		</div>
	</main>
{/if}
