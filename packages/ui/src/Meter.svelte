<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Usage meter: label and value text on one line, a full-width bar beneath. -->
<script lang="ts">
	interface Props {
		label: string;
		/** Fraction 0..1, or null while unknown. */
		value: number | null;
		text?: string | null;
		tone?: 'primary' | 'secondary' | 'accent' | 'neutral';
		testid?: string;
	}
	let { label, value, text, tone = 'primary', testid }: Props = $props();
	const pct = $derived(value === null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100));
	const toneClass = {
		primary: 'progress-primary',
		secondary: 'progress-secondary',
		accent: 'progress-accent',
		neutral: '',
	};
</script>

<div class="py-1 text-sm" data-testid={testid}>
	<div class="flex justify-between gap-4">
		<dt class="text-base-content/70 shrink-0">{label}</dt>
		<dd class="min-w-0 text-right font-medium break-words">
			{text ?? (pct === null ? '—' : `${pct}%`)}
		</dd>
	</div>
	<progress
		class="progress {toneClass[tone]} mt-1 h-1.5 w-full"
		value={pct ?? undefined}
		max="100"
		aria-label={label}
		aria-valuetext={text ?? undefined}
	></progress>
</div>
