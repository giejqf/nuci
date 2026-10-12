<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Layout shared by form fields: label, control, description, error. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '@nuci/i18n';

	interface Props {
		id: string;
		label: string;
		description?: string;
		error?: string | null;
		children: Snippet;
	}
	let { id, label, description, error = null, children }: Props = $props();
</script>

<fieldset class="fieldset">
	<label class="fieldset-legend" for={id}>{label}</label>
	{@render children()}
	{#if error}
		<p class="label text-error" id="{id}-error" role="alert">{t(error)}</p>
	{:else if description}
		<p class="label whitespace-normal" id="{id}-desc">{description}</p>
	{/if}
</fieldset>
