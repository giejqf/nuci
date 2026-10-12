<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- UI language; the choice is stored per browser and applied by reloading. -->
<script lang="ts">
	import { Languages } from '@lucide/svelte';
	import { getLocale, t } from '@nuci/i18n';
	import { availableLocales, LANGUAGE_NAMES, switchLocale } from '../lib/locale';

	const locales = availableLocales();
</script>

{#if locales.length > 1}
	<label class="flex items-center gap-1">
		<Languages size={18} aria-hidden="true" />
		<select
			class="select select-ghost select-sm w-auto"
			aria-label={t('ui.language')}
			value={getLocale()}
			onchange={(e) => switchLocale(e.currentTarget.value)}
			data-testid="language"
		>
			{#each locales as l (l)}
				<option value={l} lang={l}>{LANGUAGE_NAMES[l] ?? l}</option>
			{/each}
		</select>
	</label>
{/if}
