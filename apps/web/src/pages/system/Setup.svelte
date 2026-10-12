<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
	System → Setup wizard (AGENTS.md Phase 14): root password, internet,
	Wi-Fi, time zone. The password is set right away; everything else is
	staged and applied at the end with the rollback protocol.
-->
<script lang="ts">
	import { Check, ChevronLeft, ChevronRight, CircleCheck, KeyRound } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { isRpcError } from '@nuci/rpc';
	import {
		applyStaged,
		ChangeList,
		Form,
		getNuciContext,
		Page,
		Section,
		Select,
		TextField,
		toasts,
		validators,
	} from '@nuci/ui';
	import { onMount } from 'svelte';
	import { rpc, uci } from '../../lib/services';
	import { session } from '../../lib/session.svelte';
	import { router } from '../../router/router.svelte';
	import { DEFAULT_PATH } from '../../router/routes';
	import ProtoFields from '../network/ProtoFields.svelte';
	import { obsoleteOptions, proto, type ProtoField } from '../network/proto-registry';
	import { countrySuggestion, wifiEncryptions, WIZARD_PROTOS } from './setup';

	type Step = 'password' | 'internet' | 'wifi' | 'time' | 'review' | 'done';

	const ctx = getNuciContext();
	const sys = '@system[0]';

	let error = $state('');
	let loaded = $state(false);
	let hasWireless = $state(false);
	let handlers = $state<Record<string, unknown> | null>(null);
	let zones = $state<Record<string, string>>({});
	let rootPassword = $state(true);
	let pw1 = $state('');
	let pw2 = $state('');
	let pwBusy = $state(false);
	let passwordSet = $state(false);
	let step = $state<Step>('password');
	let valid = $state(true);
	let applying = $state(false);

	const steps = $derived<Step[]>([
		'password',
		'internet',
		...(hasWireless ? (['wifi'] as Step[]) : []),
		'time',
		'review',
	]);
	const index = $derived(steps.indexOf(step));
	const canPassword = $derived(session.acl.canCall('rpc-sys', 'password_set'));
	const pwError = $derived(pw1 && pw2 && pw1 !== pw2 ? 'admin.password_mismatch' : null);
	const hasWan = $derived(uci.getSection('network', 'wan')?.['.type'] === 'interface');
	const wanProto = $derived(String(uci.get('network', 'wan', 'proto') ?? 'dhcp'));
	const protoOptions = $derived(
		WIZARD_PROTOS.filter((p) => !handlers || p.id === 'dhcp' || p.id in handlers).map((p) => ({
			value: p.id,
			label: t(`setup.internet.${p.id}`),
		})),
	);
	const wanFields = $derived.by((): ProtoField[] => {
		const wanted = WIZARD_PROTOS.find((p) => p.id === wanProto)?.options ?? [];
		const all = proto(wanProto)?.fields ?? [];
		return wanted.flatMap((o) => all.filter((f) => f.option === o));
	});
	const radios = $derived(uci.sections('wireless', 'wifi-device').map((s) => s['.name']));
	const zoneOptions = $derived(
		Object.keys(zones).map((z) => ({ value: z, label: z.replaceAll('_', ' ') })),
	);
	// Leaving the password step needs a password on the router.
	const blocked = $derived(!valid || (step === 'password' && !rootPassword && !passwordSet));

	onMount(() => {
		void (async () => {
			try {
				await uci.load('network', 'system');
				hasWireless = await uci
					.load('wireless')
					.then(() => uci.sections('wireless', 'wifi-device').length > 0)
					.catch(() => false);
				loaded = true;
			} catch (e) {
				error = isRpcError(e) ? t(e.messageKey) : String(e);
			}
		})();
		rpc.network
			.protoHandlers()
			.then((h) => (handlers = h))
			.catch(() => (handlers = null));
		rpc.nuci.system
			.timezones()
			.then((z) => (zones = z))
			.catch(() => {});
		rpc.nuci.system
			.setupStatus()
			.then((s) => (rootPassword = s.root_password))
			.catch(() => {});
	});

	async function setPassword(e: SubmitEvent) {
		e.preventDefault();
		if (!pw1 || pwError) return;
		pwBusy = true;
		try {
			await rpc.rpcSys.passwordSet('root', pw1);
			pw1 = pw2 = '';
			passwordSet = true;
			toasts.success(t('admin.password_changed'));
		} catch (err) {
			toasts.error(isRpcError(err) ? t(err.messageKey) : String(err));
		} finally {
			pwBusy = false;
		}
	}

	function setWanProto(next: string) {
		for (const opt of obsoleteOptions(wanProto, next)) uci.set('network', 'wan', opt, null);
		uci.set('network', 'wan', 'proto', next);
	}

	/** The radio's first access point; created when the user enables Wi-Fi. */
	function apOf(radio: string): string | undefined {
		return uci
			.sections('wireless', 'wifi-iface')
			.find((s) => s.device === radio && (s.mode ?? 'ap') === 'ap')?.['.name'];
	}

	function apEnabled(radio: string): boolean {
		const ap = apOf(radio);
		return (
			!!ap &&
			uci.get('wireless', ap, 'disabled') !== '1' &&
			uci.get('wireless', radio, 'disabled') !== '1'
		);
	}

	function setApEnabled(radio: string, on: boolean) {
		let ap = apOf(radio);
		if (on) {
			ap ??= uci.add('wireless', 'wifi-iface', undefined, {
				device: radio,
				mode: 'ap',
				ssid: 'OpenWrt',
				network: 'lan',
			});
			// The wizard sets up protected networks only (open/OWE stays on the Wireless page).
			const encs = wifiEncryptions(uci.get('wireless', radio, 'band'));
			if (!encs.includes(String(uci.get('wireless', ap, 'encryption') ?? '')))
				uci.set('wireless', ap, 'encryption', encs[0]!);
			const country = String(uci.get('wireless', radio, 'country') ?? '');
			const suggested = countrySuggestion(navigator.language);
			if ((!country || country === '00') && suggested)
				uci.set('wireless', radio, 'country', suggested);
			if (uci.get('wireless', radio, 'disabled') === '1')
				uci.set('wireless', radio, 'disabled', null);
		}
		if (ap) uci.set('wireless', ap, 'disabled', on ? null : '1');
	}

	function setZone(z: string) {
		uci.set('system', sys, 'timezone', zones[z] ?? 'UTC0');
	}

	function go(delta: number) {
		const next = steps[index + delta];
		if (next) step = next;
	}

	function leave() {
		router.navigate(DEFAULT_PATH);
	}

	async function apply() {
		applying = true;
		try {
			const phase = await applyStaged(ctx, true);
			if (phase === 'confirmed') step = 'done';
		} finally {
			applying = false;
		}
	}

	const keyValid = (v: string) => (v.length < 8 || v.length > 63 ? 'wireless.key_invalid' : null);
	const countryValid = (v: string) => (/^[A-Z]{2}$/.test(v) ? null : 'wireless.country_invalid');
	const ssidValid = (v: string) =>
		v.length < 1 || v.length > 32 ? 'wireless.ssid_invalid' : null;
</script>

<Page title={t('setup.title')} description={t('setup.description')}>
	{#snippet actions()}
		{#if step !== 'done'}
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				onclick={leave}
				data-testid="setup-skip">{t('setup.skip')}</button
			>
		{/if}
	{/snippet}
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}

	{#if step !== 'done'}
		<ol class="steps steps-horizontal w-full overflow-x-auto" aria-label={t('setup.progress')}>
			{#each steps as s, i (s)}
				<li
					class="step {i <= index ? 'step-primary' : ''}"
					aria-current={s === step ? 'step' : undefined}
				>
					{t(`setup.step.${s}`)}
				</li>
			{/each}
		</ol>
	{/if}

	{#if !loaded}
		<span class="loading loading-spinner" role="status" aria-label={t('ui.loading')}></span>
	{:else if step === 'password'}
		<Section title={t('setup.password.title')} description={t('setup.password.help')}>
			{#if rootPassword || passwordSet}
				<div
					role="status"
					class="alert alert-success alert-soft"
					data-testid="setup-password-ok"
				>
					<Check size={16} aria-hidden="true" />{passwordSet
						? t('setup.password.done')
						: t('setup.password.already')}
				</div>
			{:else}
				<div role="alert" class="alert alert-warning alert-soft">
					{t('setup.password.none')}
				</div>
			{/if}
			<form
				class="flex flex-col gap-1"
				onsubmit={setPassword}
				data-testid="setup-password-form"
			>
				<TextField
					label={t('admin.new_password')}
					type="password"
					autocomplete="new-password"
					bind:value={pw1}
					readonly={!canPassword}
					testid="setup-pw1"
				/>
				<TextField
					label={t('admin.confirm_password')}
					type="password"
					autocomplete="new-password"
					bind:value={pw2}
					readonly={!canPassword}
					validate={() => pwError}
					testid="setup-pw2"
				/>
				<div>
					<button
						class="btn btn-primary btn-sm mt-2"
						type="submit"
						disabled={!canPassword || !pw1 || pw1 !== pw2 || pwBusy}
						data-testid="setup-set-password"
					>
						<KeyRound size={16} aria-hidden="true" />{t('admin.set_password')}
					</button>
				</div>
			</form>
		</Section>
	{:else if step === 'internet'}
		<Section title={t('setup.internet.title')} description={t('setup.internet.help')}>
			{#if hasWan}
				<Form bind:valid class="flex flex-col gap-1">
					<Select
						label={t('setup.internet.type')}
						uci="network.wan.proto"
						options={protoOptions}
						onchange={setWanProto}
						testid="setup-wan-proto"
					/>
					{#if wanProto === 'dhcp'}
						<p class="text-base-content/70 text-sm">{t('setup.internet.dhcp_help')}</p>
					{/if}
					<ProtoFields iface="wan" fields={wanFields} />
				</Form>
			{:else}
				<div role="status" class="alert alert-info alert-soft">
					{t('setup.internet.no_wan')}
				</div>
			{/if}
		</Section>
	{:else if step === 'wifi'}
		<Form bind:valid class="grid gap-4 xl:grid-cols-2">
			{#each radios as radio (radio)}
				{@const ap = apOf(radio)}
				{@const band = uci.get('wireless', radio, 'band')}
				<Section
					title={t('setup.wifi.radio', {
						radio,
						band: t(
							`setup.wifi.band.${['2g', '5g', '6g', '60g'].includes(String(band)) ? band : 'other'}`,
						),
					})}
					testid="setup-radio-{radio}"
				>
					<label class="label cursor-pointer justify-start gap-3">
						<input
							type="checkbox"
							class="toggle toggle-primary"
							checked={apEnabled(radio)}
							onchange={(e) => setApEnabled(radio, e.currentTarget.checked)}
							data-testid="setup-wifi-enable-{radio}"
						/>
						<span>{t('setup.wifi.enable')}</span>
					</label>
					{#if ap && apEnabled(radio)}
						<TextField
							label={t('wireless.ssid')}
							uci="wireless.{ap}.ssid"
							validate={ssidValid}
							testid="setup-wifi-ssid-{radio}"
						/>
						<Select
							label={t('wireless.encryption')}
							uci="wireless.{ap}.encryption"
							options={wifiEncryptions(band).map((e) => ({
								value: e,
								label: t(`wireless.enc.${e}`),
							}))}
							testid="setup-wifi-encryption-{radio}"
						/>
						<TextField
							label={t('wireless.key')}
							uci="wireless.{ap}.key"
							type="password"
							autocomplete="new-password"
							validate={keyValid}
							testid="setup-wifi-key-{radio}"
						/>
						<TextField
							label={t('wireless.country')}
							uci="wireless.{radio}.country"
							validate={countryValid}
							description={t('wireless.country_help')}
							testid="setup-wifi-country-{radio}"
						/>
					{/if}
				</Section>
			{/each}
		</Form>
	{:else if step === 'time'}
		<Section title={t('setup.time.title')} description={t('setup.time.help')}>
			<Form bind:valid class="flex flex-col gap-1">
				<TextField
					label={t('general.hostname')}
					uci="system.{sys}.hostname"
					validate={validators.all(validators.required, validators.hostname)}
					testid="setup-hostname"
				/>
				{#if zoneOptions.length}
					<Select
						label={t('general.timezone')}
						uci="system.{sys}.zonename"
						options={zoneOptions}
						placeholder={String(uci.get('system', sys, 'zonename') ?? 'UTC')}
						onchange={setZone}
						testid="setup-zonename"
					/>
				{/if}
			</Form>
		</Section>
	{:else if step === 'review'}
		<Section title={t('setup.review.title')} description={t('setup.review.help')}>
			{#if uci.totalChanges === 0}
				<p data-testid="setup-no-changes">{t('setup.review.nothing')}</p>
			{:else}
				<ChangeList changes={uci.changes} pending={uci.pending} />
				<div role="note" class="alert alert-info alert-soft text-sm">
					{t('setup.review.rollback', { seconds: ctx.apply?.timeout ?? 90 })}
				</div>
			{/if}
			<div aria-live="polite" data-testid="setup-apply-status">
				{#if applying}
					<span class="inline-flex items-center gap-2">
						<span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
						{uci.apply.phase === 'confirming' && uci.apply.remaining
							? t('ui.apply.confirming', { seconds: uci.apply.remaining })
							: t('ui.apply.applying')}
					</span>
				{/if}
			</div>
		</Section>
	{:else if step === 'done'}
		<Section title={t('setup.done.title')} testid="setup-done">
			<p>{t('setup.done.text')}</p>
			<div>
				<button type="button" class="btn btn-primary" onclick={leave}
					>{t('setup.done.overview')}</button
				>
			</div>
		</Section>
	{/if}

	{#if loaded && step !== 'done'}
		<div class="flex flex-wrap justify-between gap-2">
			<button
				type="button"
				class="btn"
				disabled={index === 0 || applying}
				onclick={() => go(-1)}
				data-testid="setup-back"
			>
				<ChevronLeft size={16} aria-hidden="true" />{t('setup.back')}
			</button>
			{#if step === 'review'}
				<button
					type="button"
					class="btn btn-primary"
					disabled={applying}
					onclick={uci.totalChanges ? apply : () => (step = 'done')}
					data-testid="setup-apply"
				>
					<CircleCheck size={16} aria-hidden="true" />{uci.totalChanges
						? t('setup.review.apply')
						: t('setup.review.finish')}
				</button>
			{:else}
				<button
					type="button"
					class="btn btn-primary"
					disabled={blocked}
					onclick={() => go(1)}
					data-testid="setup-next"
				>
					{t('setup.next')}<ChevronRight size={16} aria-hidden="true" />
				</button>
			{/if}
		</div>
	{/if}
</Page>
