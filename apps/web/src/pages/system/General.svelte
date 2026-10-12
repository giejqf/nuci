<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- System → General: hostname, time zone, clock, NTP, logging (uci system). -->
<script lang="ts">
	import { Clock } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { isRpcError } from '@nuci/rpc';
	import {
		DynamicList,
		Form,
		formatDateTime,
		Page,
		Section,
		Select,
		TextField,
		Toggle,
		toasts,
		validators,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { rpc, uci } from '../../lib/services';
	import { session } from '../../lib/session.svelte';

	let zones = $state<Record<string, string>>({});
	let routerTime = $state<number | null>(null);
	let fetchedAt = 0;
	let now = $state(Date.now());
	let error = $state('');

	const readonly = $derived(!session.canWriteUci('system'));
	const sys = '@system[0]';
	const zoneOptions = $derived(
		Object.keys(zones).map((z) => ({ value: z, label: z.replaceAll('_', ' ') })),
	);
	const zonename = $derived(String(uci.get('system', sys, 'zonename') ?? 'UTC'));
	const clock = $derived(
		routerTime === null ? null : routerTime + Math.round((now - fetchedAt) / 1000),
	);

	async function loadTime() {
		const lt = await rpc.nuci.system.localtime();
		routerTime = lt.localtime;
		fetchedAt = Date.now();
	}

	onMount(() => {
		uci.load('system').catch((e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)));
		rpc.nuci.system.timezones().then((z) => (zones = z));
		void loadTime();
		const tick = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(tick);
	});

	// Choosing a zone also stages its POSIX TZ string (what the system uses).
	function setZone(z: string) {
		uci.set('system', sys, 'timezone', zones[z] ?? 'UTC0');
	}

	async function syncClock() {
		try {
			await rpc.nuci.system.setLocaltime(Math.floor(Date.now() / 1000));
			await loadTime();
			toasts.success(t('general.clock_synced'));
		} catch (e) {
			toasts.error(isRpcError(e) ? t(e.messageKey) : String(e));
		}
	}

	const logLevels = $derived(
		[
			['8', 'log.levels.debug'],
			['7', 'log.levels.info'],
			['6', 'log.levels.notice'],
			['5', 'log.levels.warning'],
			['4', 'log.levels.err'],
			['3', 'log.levels.crit'],
			['2', 'log.levels.alert'],
			['1', 'log.levels.emerg'],
		].map(([value, key]) => ({ value: value!, label: t(key!) })),
	);
</script>

<Page title={t('general.title')} description={t('general.description')} {readonly}>
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	{#if uci.isLoaded('system')}
		<Form class="grid gap-4 xl:grid-cols-2">
			<Section title={t('general.identity')}>
				<TextField
					label={t('general.hostname')}
					uci="system.{sys}.hostname"
					validate={validators.all(validators.required, validators.hostname)}
					testid="hostname"
				/>
				<TextField
					label={t('general.notes')}
					uci="system.{sys}.description"
					description={t('general.notes_help')}
				/>
			</Section>

			<Section title={t('general.time')}>
				<div class="flex flex-wrap items-center gap-3 text-sm">
					<Clock size={16} aria-hidden="true" />
					<span data-testid="router-clock">{formatDateTime(clock)}</span>
					{#if !readonly}
						<button
							type="button"
							class="btn btn-sm"
							onclick={syncClock}
							data-testid="sync-clock">{t('general.sync_browser')}</button
						>
					{/if}
				</div>
				{#if zoneOptions.length}
					<Select
						label={t('general.timezone')}
						uci="system.{sys}.zonename"
						options={zoneOptions}
						placeholder={zonename}
						onchange={setZone}
						testid="zonename"
					/>
				{/if}
			</Section>

			<Section title={t('general.ntp')}>
				<Toggle
					label={t('general.ntp_client')}
					uci="system.ntp.enabled"
					default={true}
					testid="ntp-enabled"
				/>
				<Toggle
					label={t('general.ntp_server')}
					uci="system.ntp.enable_server"
					description={t('general.ntp_server_help')}
				/>
				<DynamicList
					label={t('general.ntp_servers')}
					uci="system.ntp.server"
					validate={validators.hostname}
					placeholder="pool.ntp.org"
					testid="ntp-servers"
				/>
			</Section>

			<Section title={t('general.logging')}>
				<TextField
					label={t('general.log_size')}
					uci="system.{sys}.log_size"
					type="number"
					validate={validators.integer(1, 65536)}
					description={t('general.log_size_help')}
				/>
				<TextField
					label={t('general.log_ip')}
					uci="system.{sys}.log_ip"
					validate={validators.ipaddr}
					description={t('general.log_ip_help')}
				/>
				<TextField
					label={t('general.log_port')}
					uci="system.{sys}.log_port"
					validate={validators.port}
					placeholder="514"
				/>
				<Select
					label={t('general.conloglevel')}
					uci="system.{sys}.conloglevel"
					options={logLevels}
					placeholder={t('log.levels.debug')}
				/>
				<Select
					label={t('general.cronloglevel')}
					uci="system.{sys}.cronloglevel"
					options={[
						{ value: '5', label: t('general.cron_normal') },
						{ value: '7', label: t('general.cron_warn') },
						{ value: '9', label: t('general.cron_errors') },
					]}
					placeholder={t('general.cron_normal')}
				/>
			</Section>
		</Form>
	{:else if !error}
		<div class="flex justify-center p-8" role="status">
			<span class="loading loading-spinner" aria-label={t('ui.loading')}></span>
		</div>
	{/if}
</Page>
