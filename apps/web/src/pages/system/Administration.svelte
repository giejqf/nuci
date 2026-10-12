<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- System → Administration: root password, SSH (dropbear), SSH keys, web server (uhttpd). -->
<script lang="ts">
	import { KeyRound, RefreshCw } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { isRpcError } from '@nuci/rpc';
	import {
		Form,
		Modal,
		Page,
		Section,
		Select,
		TextField,
		Toggle,
		toasts,
		validators,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { probe, rpc, uci } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	const KEYS = '/etc/dropbear/authorized_keys';
	const KEY_RE =
		/^(?:[a-z0-9-]+(?:="[^"]*")?(?:,[a-z0-9-]+(?:="[^"]*")?)* )?(ssh-(ed25519|rsa|dss)|ecdsa-sha2-nistp(256|384|521)|sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com) [A-Za-z0-9+/=]+( .*)?$/;

	let pw1 = $state('');
	let pw2 = $state('');
	let pwBusy = $state(false);
	let keys = $state('');
	let keysLoaded = $state(false);
	let keysBusy = $state(false);
	let certConfirm = $state(false);
	let error = $state('');

	const canPassword = $derived(session.acl.canCall('rpc-sys', 'password_set'));
	const pwError = $derived(pw1 && pw2 && pw1 !== pw2 ? 'admin.password_mismatch' : null);
	const keyLines = $derived(
		keys
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l && !l.startsWith('#')),
	);
	const badKeys = $derived(keyLines.filter((l) => !KEY_RE.test(l)));
	const interfaces = $derived(
		uci.sections('network', 'interface').map((s) => ({ value: s['.name'], label: s['.name'] })),
	);

	onMount(() => {
		uci.load('dropbear', 'uhttpd', 'network').catch(
			(e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)),
		);
		rpc.file
			.read(KEYS)
			.then((k) => (keys = k))
			.catch(() => (keys = ''))
			.finally(() => (keysLoaded = true));
	});

	async function setPassword(e: SubmitEvent) {
		e.preventDefault();
		if (!pw1 || pwError) return;
		pwBusy = true;
		try {
			await rpc.rpcSys.passwordSet('root', pw1);
			pw1 = pw2 = '';
			toasts.success(t('admin.password_changed'));
		} catch (err) {
			toasts.error(isRpcError(err) ? t(err.messageKey) : String(err));
		} finally {
			pwBusy = false;
		}
	}

	async function saveKeys() {
		keysBusy = true;
		try {
			await rpc.file.write(KEYS, keyLines.join('\n') + (keyLines.length ? '\n' : ''), {
				mode: 0o600,
			});
			toasts.success(t('admin.keys_saved', { count: keyLines.length }));
		} catch (err) {
			toasts.error(isRpcError(err) ? t(err.messageKey) : String(err));
		} finally {
			keysBusy = false;
		}
	}

	async function regenerateCert() {
		certConfirm = false;
		try {
			await Promise.allSettled([
				rpc.file.remove('/etc/uhttpd.crt'),
				rpc.file.remove('/etc/uhttpd.key'),
			]);
			// uhttpd restarts and creates a new certificate; this request may be cut off.
			await rpc.rc.init('uhttpd', 'restart').catch(() => {});
			for (let i = 0; i < 30 && !(await probe()); i++)
				await new Promise((r) => setTimeout(r, 1000));
			toasts.success(t('admin.cert_regenerated'));
		} catch (err) {
			toasts.error(isRpcError(err) ? t(err.messageKey) : String(err));
		}
	}
</script>

<Page title={t('admin.title')} description={t('admin.description')}>
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	<div class="grid gap-4 xl:grid-cols-2">
		<Section title={t('admin.password')} description={t('admin.password_help')}>
			<form class="flex flex-col gap-1" onsubmit={setPassword} data-testid="password-form">
				<TextField
					label={t('admin.new_password')}
					type="password"
					autocomplete="new-password"
					bind:value={pw1}
					readonly={!canPassword}
				/>
				<TextField
					label={t('admin.confirm_password')}
					type="password"
					autocomplete="new-password"
					bind:value={pw2}
					readonly={!canPassword}
					validate={() => pwError}
				/>
				<div>
					<button
						class="btn btn-primary btn-sm mt-2"
						type="submit"
						disabled={!canPassword || !pw1 || !!pwError || pwBusy}
					>
						<KeyRound size={16} aria-hidden="true" />{t('admin.set_password')}
					</button>
				</div>
			</form>
		</Section>

		{#if uci.isLoaded('dropbear')}
			<Section title={t('admin.ssh')} description={t('admin.ssh_help')}>
				<Form>
					<Toggle
						label={t('admin.ssh_enabled')}
						uci="dropbear.@dropbear[0].enable"
						default={true}
					/>
					<Select
						label={t('admin.ssh_interface')}
						uci="dropbear.@dropbear[0].Interface"
						options={[{ value: '', label: t('admin.ssh_any') }, ...interfaces]}
					/>
					<TextField
						label={t('admin.ssh_port')}
						uci="dropbear.@dropbear[0].Port"
						validate={validators.all(validators.required, validators.port)}
					/>
					<Toggle
						label={t('admin.ssh_password_auth')}
						uci="dropbear.@dropbear[0].PasswordAuth"
						on="on"
						off="off"
						default={true}
					/>
					<Toggle
						label={t('admin.ssh_root_password_auth')}
						uci="dropbear.@dropbear[0].RootPasswordAuth"
						on="on"
						off="off"
						default={true}
					/>
					<Toggle
						label={t('admin.ssh_gateway_ports')}
						uci="dropbear.@dropbear[0].GatewayPorts"
						on="on"
						off="off"
						default={false}
					/>
				</Form>
			</Section>
		{/if}

		<Section title={t('admin.keys')} description={t('admin.keys_help')}>
			{#if keysLoaded}
				<label class="fieldset" for="ssh-keys">
					<span class="fieldset-legend">{t('admin.keys_label')}</span>
					<textarea
						id="ssh-keys"
						class="textarea h-40 w-full font-mono text-xs"
						bind:value={keys}
						spellcheck="false"
						data-testid="ssh-keys"></textarea>
				</label>
				{#if badKeys.length}
					<p role="alert" class="text-error text-sm">
						{t('admin.keys_invalid', { count: badKeys.length })}
					</p>
				{/if}
				<div>
					<button
						type="button"
						class="btn btn-sm"
						disabled={keysBusy || badKeys.length > 0}
						onclick={saveKeys}
						data-testid="save-keys">{t('admin.keys_save')}</button
					>
				</div>
			{/if}
		</Section>

		{#if uci.isLoaded('uhttpd')}
			<Section title={t('admin.web')} description={t('admin.web_help')}>
				<Form>
					<Toggle
						label={t('admin.https_redirect')}
						uci="uhttpd.main.redirect_https"
						default={false}
					/>
					<Toggle
						label={t('admin.rfc1918_filter')}
						uci="uhttpd.main.rfc1918_filter"
						default={true}
						description={t('admin.rfc1918_help')}
					/>
				</Form>
				<div>
					<button type="button" class="btn btn-sm" onclick={() => (certConfirm = true)}>
						<RefreshCw size={16} aria-hidden="true" />{t('admin.cert_regenerate')}
					</button>
				</div>
			</Section>
		{/if}
	</div>
</Page>

<Modal bind:open={certConfirm} title={t('admin.cert_regenerate')}>
	<p>{t('admin.cert_confirm')}</p>
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (certConfirm = false)}
			>{t('ui.cancel')}</button
		>
		<button type="button" class="btn btn-primary" onclick={regenerateCert}
			>{t('admin.cert_regenerate')}</button
		>
	{/snippet}
</Modal>
