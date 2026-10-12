<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	System → Users: NuCI logins besides root (ADR-0006). Users are created,
	changed and removed immediately by nuci.users (a system account without a
	shell plus an rpcd login); they are not uci edits and need no apply.
-->
<script lang="ts">
	import { KeyRound, Pencil, Plus, Trash2 } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { isRpcError, type NuciUser } from '@nuci/rpc';
	import {
		DataTable,
		ListField,
		Modal,
		Page,
		Section,
		Select,
		TextField,
		toasts,
		validators,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { grantsFor, roleOf, ROLES, assignable, type Role } from '../../lib/roles';
	import { rpc } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	let users = $state<NuciUser[]>([]);
	let groups = $state<Record<string, string>>({});
	let error = $state('');
	let busy = $state(false);

	// Add / edit permissions
	let editing = $state<{ username: string; isNew: boolean } | null>(null);
	let username = $state('');
	let password = $state('');
	let password2 = $state('');
	let role = $state<Role>('readonly');
	let customRead = $state<string[]>([]);
	let customWrite = $state<string[]>([]);
	// Password / delete
	let pwUser = $state<string | null>(null);
	let deleting = $state<string | null>(null);

	const writable = $derived(session.acl.canCall('nuci.users', 'create'));
	const options = $derived(assignable(groups).map((g) => ({ value: g, label: g })));
	const nameError = $derived(
		!username
			? null
			: !/^[a-z_][a-z0-9_-]{0,31}$/.test(username)
				? 'users.name_invalid'
				: users.some((u) => u.username === username)
					? 'users.name_exists'
					: null,
	);
	const pwError = (v: string) => (v.length > 0 && v.length < 8 ? 'users.password_short' : null);
	const pwMismatch = $derived(password2 !== '' && password2 !== password);
	const grants = $derived(
		role === 'custom' ? { read: customRead, write: customWrite } : grantsFor(role, groups),
	);
	const fail = (e: unknown) => toasts.error(isRpcError(e) ? t(e.messageKey) : String(e));

	async function refresh() {
		try {
			[users, groups] = await Promise.all([rpc.nuci.users.list(), rpc.nuci.users.groups()]);
			error = '';
		} catch (e) {
			error = isRpcError(e) ? t(e.messageKey) : String(e);
		}
	}
	onMount(refresh);

	function openAdd() {
		editing = { username: '', isNew: true };
		username = password = password2 = '';
		role = 'readonly';
		customRead = [];
		customWrite = [];
	}

	function openEdit(u: NuciUser) {
		editing = { username: u.username, isNew: false };
		role = roleOf(u, groups);
		customRead = [...u.read];
		customWrite = [...u.write];
	}

	async function save() {
		if (!editing) return;
		busy = true;
		try {
			if (editing.isNew) {
				await rpc.nuci.users.create({ username, password, ...grants });
				toasts.success(t('users.created', { name: username }));
			} else {
				await rpc.nuci.users.update({ username: editing.username, ...grants });
				toasts.success(t('users.updated', { name: editing.username }));
			}
			editing = null;
			await refresh();
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}

	async function savePassword() {
		if (!pwUser) return;
		busy = true;
		try {
			await rpc.nuci.users.setPassword(pwUser, password);
			toasts.success(t('users.password_set', { name: pwUser }));
			pwUser = null;
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!deleting) return;
		busy = true;
		try {
			await rpc.nuci.users.delete(deleting);
			toasts.success(t('users.deleted', { name: deleting }));
			deleting = null;
			await refresh();
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}

	const canSave = $derived(
		!busy &&
			(!editing?.isNew ||
				(!!username && !nameError && password.length >= 8 && password === password2)) &&
			(role !== 'custom' || customRead.length > 0),
	);
</script>

<Page title={t('users.title')} description={t('users.help')} readonly={!writable}>
	{#snippet actions()}
		{#if writable}
			<button type="button" class="btn btn-sm" onclick={openAdd} data-testid="users-add">
				<Plus size={16} aria-hidden="true" />{t('users.add')}
			</button>
		{/if}
	{/snippet}
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	<Section>
		<DataTable
			testid="users"
			rows={users}
			rowKey={(u) => u.username}
			columns={[
				{ key: 'username', label: t('users.username'), sortable: true },
				{ key: 'role', label: t('users.role') },
				{ key: 'actions', label: t('users.actions') },
			]}
		>
			{#snippet cell(u, c)}
				{#if c.key === 'username'}
					<span class="font-medium">{u.username}</span>
				{:else if c.key === 'role'}
					{#if u.builtin}
						<span class="badge badge-neutral badge-sm">{t('users.builtin')}</span>
					{:else}
						{t(`users.role.${roleOf(u, groups)}`)}
					{/if}
				{:else if c.key === 'actions' && writable && !u.builtin}
					<div class="flex gap-1">
						<button
							type="button"
							class="btn btn-ghost btn-xs"
							onclick={() => openEdit(u)}
							aria-label={t('users.edit_of', { name: u.username })}
							><Pencil size={14} aria-hidden="true" /></button
						>
						{#if u.managed}
							<button
								type="button"
								class="btn btn-ghost btn-xs"
								onclick={() => ((pwUser = u.username), (password = password2 = ''))}
								aria-label={t('users.password_of', { name: u.username })}
								><KeyRound size={14} aria-hidden="true" /></button
							>
						{/if}
						<button
							type="button"
							class="btn btn-ghost btn-xs text-error"
							onclick={() => (deleting = u.username)}
							aria-label={t('ui.delete_entry', { name: u.username })}
							><Trash2 size={14} aria-hidden="true" /></button
						>
					</div>
				{/if}
			{/snippet}
		</DataTable>
	</Section>
</Page>

<Modal
	open={editing !== null}
	title={editing?.isNew ? t('users.add') : t('users.edit_of', { name: editing?.username ?? '' })}
	onclose={() => (editing = null)}
	testid="users-modal"
>
	{#if editing?.isNew}
		<TextField
			label={t('users.username')}
			bind:value={username}
			validate={() => nameError}
			testid="user-name"
		/>
		<TextField
			label={t('users.password')}
			type="password"
			bind:value={password}
			validate={validators.all(validators.required, pwError)}
			testid="user-password"
		/>
		<TextField
			label={t('users.password_repeat')}
			type="password"
			bind:value={password2}
			validate={() => (pwMismatch ? 'users.password_mismatch' : null)}
			testid="user-password2"
		/>
	{/if}
	<Select
		label={t('users.role')}
		bind:value={role}
		options={ROLES.map((r) => ({ value: r, label: t(`users.role.${r}`) }))}
		description={t(`users.role_help.${role}`)}
		testid="user-role"
	/>
	{#if role === 'custom'}
		<ListField
			label={t('users.read_groups')}
			{options}
			bind:values={customRead}
			testid="user-read"
		/>
		<ListField
			label={t('users.write_groups')}
			{options}
			bind:values={customWrite}
			testid="user-write"
		/>
	{/if}
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (editing = null)}
			>{t('ui.cancel')}</button
		>
		<button
			type="button"
			class="btn btn-primary"
			disabled={!canSave}
			onclick={save}
			data-testid="user-save">{t('users.save')}</button
		>
	{/snippet}
</Modal>

<Modal
	open={pwUser !== null}
	title={t('users.password_of', { name: pwUser ?? '' })}
	onclose={() => (pwUser = null)}
>
	<TextField
		label={t('users.password')}
		type="password"
		bind:value={password}
		validate={validators.all(validators.required, pwError)}
		testid="user-newpw"
	/>
	<TextField
		label={t('users.password_repeat')}
		type="password"
		bind:value={password2}
		validate={() => (pwMismatch ? 'users.password_mismatch' : null)}
		testid="user-newpw2"
	/>
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (pwUser = null)}
			>{t('ui.cancel')}</button
		>
		<button
			type="button"
			class="btn btn-primary"
			disabled={busy || password.length < 8 || password !== password2}
			onclick={savePassword}
			data-testid="user-newpw-save">{t('users.save')}</button
		>
	{/snippet}
</Modal>

<Modal open={deleting !== null} title={t('users.delete')} onclose={() => (deleting = null)}>
	<p>{t('users.delete_confirm', { name: deleting ?? '' })}</p>
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (deleting = null)}
			>{t('ui.cancel')}</button
		>
		<button
			type="button"
			class="btn btn-error"
			disabled={busy}
			onclick={remove}
			data-testid="user-delete-confirm">{t('ui.delete')}</button
		>
	{/snippet}
</Modal>
