<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import type { UciStore } from '@nuci/uci';
	import { setNuciContext } from '../context';
	import SectionList from '../SectionList.svelte';
	import TextField from '../TextField.svelte';

	let { store }: { store: UciStore } = $props();
	// svelte-ignore state_referenced_locally
	setNuciContext({ uci: store });
</script>

<SectionList
	config="dhcp"
	type="host"
	testid="hosts"
	columns={[
		{ option: 'name', label: 'Name' },
		{ option: 'ip', label: 'IP' },
	]}
>
	{#snippet editor(name)}
		<TextField label="Name" uci="dhcp.{name}.name" />
	{/snippet}
</SectionList>
