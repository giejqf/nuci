<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Headline figure card: label, large value, optional bar (0..1) and a caption. -->
<script lang="ts">
	interface Props {
		label: string;
		value: string;
		/** Fraction 0..1 drawn as a thin bar under the value. */
		bar?: number | null;
		caption?: string;
		testid?: string;
	}
	let { label, value, bar = null, caption, testid }: Props = $props();
	const pct = $derived(bar === null ? null : Math.round(Math.max(0, Math.min(1, bar)) * 100));
</script>

<div
	class="card bg-base-100 border-base-300 border p-5"
	data-testid={testid}
	role="group"
	aria-label={label}
>
	<div class="text-base-content/70 text-sm">{label}</div>
	<div class="mt-2 text-3xl leading-tight font-medium tabular-nums">{value}</div>
	{#if pct !== null}
		<progress
			class="progress progress-primary mt-3 block h-1.5 w-full"
			value={pct}
			max="100"
			aria-label={label}
			aria-valuetext={value}
		></progress>
	{/if}
	{#if caption}<div class="text-base-content/70 mt-2 text-sm">{caption}</div>{/if}
</div>
