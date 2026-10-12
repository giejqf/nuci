<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Firewall → General: fw4 defaults and a preview of the generated ruleset. -->
<script lang="ts">
	import { Eye } from '@lucide/svelte';
	import { t } from '@nuci/i18n';
	import { isRpcError } from '@nuci/rpc';
	import { Form, Modal, Page, Section, Select, Toggle } from '@nuci/ui';
	import { onMount } from 'svelte';
	import { rpc, uci } from '../../lib/services';
	import { session } from '../../lib/session.svelte';
	import { policyOptions } from './options';

	let error = $state('');
	let preview = $state<{ title: string; text: string; truncated: boolean } | null>(null);
	let loading = $state(false);
	const d = '@defaults[0]';

	onMount(() => {
		uci.load('firewall').catch((e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)));
	});

	async function show(kind: 'preview' | 'ruleset') {
		loading = true;
		try {
			const r = await rpc.nuci.firewall[kind]();
			preview = { title: t(`firewall.${kind}_title`), ...r };
		} catch (e) {
			error = isRpcError(e) ? t(e.messageKey) : String(e);
		} finally {
			loading = false;
		}
	}
</script>

<Page
	title={t('firewall.general_title')}
	description={t('firewall.general_help')}
	readonly={!session.canWriteUci('firewall')}
>
	{#snippet actions()}
		<button
			type="button"
			class="btn btn-sm"
			disabled={loading}
			onclick={() => show('preview')}
			data-testid="fw-preview"
			><Eye size={16} aria-hidden="true" />{t('firewall.preview')}</button
		>
		<button
			type="button"
			class="btn btn-sm btn-ghost"
			disabled={loading}
			onclick={() => show('ruleset')}
			data-testid="fw-ruleset">{t('firewall.ruleset')}</button
		>
	{/snippet}
	{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
	{#if uci.isLoaded('firewall')}
		<Form>
			<Section title={t('firewall.defaults')}>
				<Select
					label={t('firewall.input')}
					uci="firewall.{d}.input"
					options={policyOptions()}
					testid="fw-input"
				/>
				<Select
					label={t('firewall.output')}
					uci="firewall.{d}.output"
					options={policyOptions()}
				/>
				<Select
					label={t('firewall.forward')}
					uci="firewall.{d}.forward"
					options={policyOptions()}
					testid="fw-forward"
				/>
				<Toggle
					label={t('firewall.syn_flood')}
					uci="firewall.{d}.syn_flood"
					default={false}
				/>
				<Toggle
					label={t('firewall.drop_invalid')}
					uci="firewall.{d}.drop_invalid"
					default={false}
				/>
			</Section>
			<Section title={t('firewall.offloading')} description={t('firewall.offloading_help')}>
				<Toggle
					label={t('firewall.flow_offloading')}
					uci="firewall.{d}.flow_offloading"
					default={false}
				/>
				{#if uci.get('firewall', d, 'flow_offloading') === '1'}
					<Toggle
						label={t('firewall.flow_offloading_hw')}
						uci="firewall.{d}.flow_offloading_hw"
						default={false}
					/>
				{/if}
			</Section>
		</Form>
	{/if}
</Page>

<Modal
	open={preview !== null}
	title={preview?.title ?? ''}
	onclose={() => (preview = null)}
	testid="fw-preview-modal"
>
	{#if preview}
		{#if preview.truncated}<p class="text-warning text-sm">{t('firewall.truncated')}</p>{/if}
		<pre
			class="bg-base-200 rounded-box max-h-[60vh] overflow-auto p-3 text-xs"
			data-testid="fw-preview-text">{preview.text}</pre>
	{/if}
	{#snippet actions()}
		<button type="button" class="btn" onclick={() => (preview = null)}>{t('ui.close')}</button>
	{/snippet}
</Modal>
