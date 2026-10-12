<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	System → Backup / Flash: configuration backup (download), restore (upload),
	and firmware upgrade: upload → system.validate_firmware_image → confirm →
	system.sysupgrade. Uploads use chunked file.write (no cgi-io).
-->
<script lang="ts">
	import { DatabaseBackup, HardDriveUpload, Upload } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { downloadFile, isRpcError, uploadFile } from '@nuci/rpc';
	import { formatBytes, Modal, Page, Section, toasts } from '@nuci/ui';
	import { rpc, waitForRestart } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	const BACKUP = '/tmp/nuci-backup.tar.gz';
	const RESTORE = '/tmp/nuci-restore.tar.gz';
	const FIRMWARE = '/tmp/firmware.bin';

	type Validation = {
		valid: boolean;
		forceable: boolean;
		allow_backup: boolean;
		tests: Record<string, boolean>;
		/** Set when the router could not run its checks at all. */
		error?: string;
	};

	let backupBusy = $state(false);
	let restoreFile = $state<File | null>(null);
	let restoreProgress = $state<number | null>(null);
	let restoreConfirm = $state(false);
	let fwFile = $state<File | null>(null);
	let fwProgress = $state<number | null>(null);
	let validation = $state<Validation | null>(null);
	let keep = $state(true);
	let force = $state(false);
	let flashConfirm = $state(false);
	let restartPhase = $state<string | null>(null);

	const canBackup = $derived(session.acl.canCall('nuci.system', 'backup_create'));
	const canFlash = $derived(session.acl.canCall('system', 'sysupgrade'));
	const err = (e: unknown) => toasts.error(isRpcError(e) ? t(e.messageKey) : String(e));
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	async function waitBackup() {
		let s = await rpc.nuci.backup.status();
		while (s.running) {
			await sleep(1000);
			s = await rpc.nuci.backup.status();
		}
		if (s.rc !== 0) throw new Error(s.log || `rc ${s.rc}`);
		return s;
	}

	async function backup() {
		backupBusy = true;
		try {
			await rpc.nuci.backup.create();
			await waitBackup();
			const bytes = await downloadFile(rpc.client, BACKUP);
			const name = `backup-${session.board?.hostname ?? 'openwrt'}-${new Date().toISOString().slice(0, 10)}.tar.gz`;
			const url = URL.createObjectURL(new Blob([bytes], { type: 'application/gzip' }));
			const a = document.createElement('a');
			a.href = url;
			a.download = name;
			a.click();
			URL.revokeObjectURL(url);
			toasts.success(t('backup.downloaded', { size: formatBytes(bytes.length) }));
		} catch (e) {
			err(e);
		} finally {
			backupBusy = false;
		}
	}

	async function restore() {
		restoreConfirm = false;
		if (!restoreFile) return;
		try {
			restoreProgress = 0;
			await uploadFile(
				rpc.client,
				RESTORE,
				restoreFile,
				(s, total) => (restoreProgress = total ? s / total : 1),
			);
			await rpc.nuci.backup.restore();
			let s = await rpc.nuci.backup.status();
			while (s.running) {
				await sleep(1000);
				s = await rpc.nuci.backup.status();
			}
			if (s.rc !== 0) throw new Error(s.log || `rc ${s.rc}`);
			await rpc.system.reboot();
			const back = await waitForRestart((p) => (restartPhase = p));
			if (back) location.reload();
		} catch (e) {
			err(e);
		} finally {
			restoreProgress = null;
		}
	}

	async function uploadFirmware() {
		if (!fwFile) return;
		validation = null;
		force = false;
		try {
			fwProgress = 0;
			await uploadFile(
				rpc.client,
				FIRMWARE,
				fwFile,
				(s, total) => (fwProgress = total ? s / total : 1),
			);
			try {
				validation = await rpc.system.validateFirmwareImage(FIRMWARE);
			} catch (e) {
				// Some targets' checks abort without a verdict (armsr/armv8 on a
				// bogus file): an image that could not be verified is not valid.
				if (!isRpcError(e)) throw e;
				validation = {
					valid: false,
					forceable: false,
					allow_backup: false,
					tests: {},
					error: t('flash.validation_failed', { error: t(e.messageKey) }),
				};
			}
			keep = validation.allow_backup;
		} catch (e) {
			err(e);
		} finally {
			fwProgress = null;
		}
	}

	async function flash() {
		flashConfirm = false;
		try {
			let backupPath: string | undefined;
			if (keep) {
				await rpc.nuci.backup.create();
				await waitBackup();
				backupPath = BACKUP;
			}
			await rpc.system.sysupgrade({
				path: FIRMWARE,
				force,
				...(backupPath ? { backup: backupPath } : {}),
			});
			const back = await waitForRestart((p) => (restartPhase = p), { upTimeoutMs: 900_000 });
			if (back) location.reload();
		} catch (e) {
			err(e);
		}
	}

	const picked = (e: Event) => (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
</script>

<Page title={t('backup.title')} description={t('backup.description')}>
	{#if restartPhase}
		<div role="status" aria-live="polite" class="alert alert-info" data-testid="restart-status">
			<span class="loading loading-spinner" aria-hidden="true"></span>{t(
				`reboot.phase.${restartPhase}`,
			)}
		</div>
	{/if}
	<div class="grid gap-4 xl:grid-cols-2">
		<Section title={t('backup.backup')} description={t('backup.backup_help')}>
			<div>
				<button
					type="button"
					class="btn btn-sm"
					disabled={!canBackup || backupBusy}
					onclick={backup}
					data-testid="backup-create"
				>
					{#if backupBusy}<span
							class="loading loading-spinner loading-xs"
							aria-hidden="true"
						></span>{:else}<DatabaseBackup size={16} aria-hidden="true" />{/if}
					{t('backup.generate')}
				</button>
			</div>
		</Section>

		<Section title={t('backup.restore')} description={t('backup.restore_help')}>
			<input
				type="file"
				class="file-input file-input-sm w-full"
				accept=".tar.gz,.tgz,application/gzip"
				aria-label={t('backup.restore_file')}
				onchange={(e) => (restoreFile = picked(e))}
				data-testid="restore-file"
			/>
			{#if restoreProgress !== null}<progress
					class="progress w-full"
					value={restoreProgress * 100}
					max="100"
				></progress>{/if}
			<div>
				<button
					type="button"
					class="btn btn-sm btn-warning"
					disabled={!restoreFile || !canBackup || restoreProgress !== null}
					onclick={() => (restoreConfirm = true)}
				>
					<Upload size={16} aria-hidden="true" />{t('backup.restore_button')}
				</button>
			</div>
		</Section>

		<Section title={t('flash.title')} description={t('flash.help')} class="xl:col-span-2">
			<input
				type="file"
				class="file-input file-input-sm w-full max-w-lg"
				aria-label={t('flash.file')}
				onchange={(e) => ((fwFile = picked(e)), (validation = null))}
				data-testid="firmware-file"
			/>
			{#if fwProgress !== null}
				<progress
					class="progress progress-primary w-full max-w-lg"
					value={fwProgress * 100}
					max="100"
					aria-label={t('flash.uploading')}
				></progress>
			{/if}
			<div>
				<button
					type="button"
					class="btn btn-sm"
					disabled={!fwFile || !canFlash || fwProgress !== null}
					onclick={uploadFirmware}
					data-testid="firmware-upload"
				>
					<HardDriveUpload size={16} aria-hidden="true" />{t('flash.upload')}
				</button>
			</div>
			{#if validation}
				<div
					role="status"
					class="alert {validation.valid ? 'alert-success' : 'alert-error'} alert-soft"
					data-testid="firmware-validation"
				>
					<div>
						<p class="font-semibold">
							{validation.valid ? t('flash.valid') : t('flash.invalid')}
						</p>
						{#if validation.error}<p class="text-sm">{validation.error}</p>{/if}
						<ul class="mt-1 text-sm">
							{#each Object.entries(validation.tests ?? {}) as [test, ok] (test)}
								<li>{ok ? '✓' : '✗'} {test}</li>
							{/each}
						</ul>
					</div>
				</div>
				{#if validation.valid || validation.forceable}
					<label class="label cursor-pointer gap-2">
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							bind:checked={keep}
							disabled={!validation.allow_backup}
						/>
						<span class="text-base-content">{t('flash.keep')}</span>
					</label>
					{#if !validation.valid && validation.forceable}
						<label class="label cursor-pointer gap-2">
							<input
								type="checkbox"
								class="checkbox checkbox-sm checkbox-error"
								bind:checked={force}
							/>
							<span class="text-error">{t('flash.force')}</span>
						</label>
					{/if}
					<div>
						<button
							type="button"
							class="btn btn-error btn-sm"
							disabled={!validation.valid && !force}
							onclick={() => (flashConfirm = true)}
							data-testid="firmware-flash">{t('flash.flash')}</button
						>
					</div>
				{/if}
			{/if}
		</Section>
	</div>
</Page>

<Modal bind:open={restoreConfirm} title={t('backup.restore')}>
	<p>{t('backup.restore_confirm')}</p>
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (restoreConfirm = false)}
			>{t('ui.cancel')}</button
		>
		<button type="button" class="btn btn-warning" onclick={restore}
			>{t('backup.restore_button')}</button
		>
	{/snippet}
</Modal>

<Modal bind:open={flashConfirm} title={t('flash.title')}>
	<p>{keep ? t('flash.confirm_keep') : t('flash.confirm_reset')}</p>
	<p class="text-error mt-2 font-semibold">{t('flash.no_power_off')}</p>
	{#snippet actions()}
		<button type="button" class="btn btn-ghost" onclick={() => (flashConfirm = false)}
			>{t('ui.cancel')}</button
		>
		<button type="button" class="btn btn-error" onclick={flash}>{t('flash.flash')}</button>
	{/snippet}
</Modal>
