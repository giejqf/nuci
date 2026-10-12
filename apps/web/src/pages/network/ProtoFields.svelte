<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Renders a protocol's fields from the registry, bound to network.<iface>. -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { DynamicList, Select, TextField, Toggle } from '@nuci/ui';
	import type { ProtoField } from './proto-registry';

	interface Props {
		iface: string;
		fields: ProtoField[];
	}
	let { iface, fields }: Props = $props();
</script>

{#each fields as f (f.option)}
	{@const ref = `network.${iface}.${f.option}`}
	{@const label = t(f.label)}
	{@const description = f.description ? t(f.description) : undefined}
	{#if f.kind === 'list'}
		<DynamicList
			{label}
			uci={ref}
			{description}
			placeholder={f.placeholder}
			validate={f.validate}
			testid="field-{f.option}"
		/>
	{:else if f.kind === 'select'}
		<Select
			{label}
			uci={ref}
			{description}
			options={(f.options ?? []).map((o) => ({ value: o.value, label: t(o.label) }))}
			placeholder={t('proto.default')}
			testid="field-{f.option}"
		/>
	{:else if f.kind === 'toggle'}
		<Toggle
			{label}
			uci={ref}
			{description}
			on={f.on}
			off={f.off}
			default={f.default}
			testid="field-{f.option}"
		/>
	{:else}
		<TextField
			{label}
			uci={ref}
			{description}
			type={f.kind === 'password' ? 'password' : f.kind === 'number' ? 'number' : 'text'}
			placeholder={f.placeholder}
			validate={f.validate}
			testid="field-{f.option}"
		/>
	{/if}
{/each}
