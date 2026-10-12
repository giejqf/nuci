<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Test host: provides the NuCI context and renders `component` with `props`. -->
<script lang="ts">
	import type { Component } from 'svelte';
	import { setNuciContext, type NuciContext } from '../context';
	import Form from '../Form.svelte';

	interface Props {
		ctx: NuciContext;
		component: Component<any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- any component under test
		with?: Record<string, unknown>;
		valid?: boolean;
	}
	let { ctx, component: C, with: props = {}, valid = $bindable(true) }: Props = $props();
	// svelte-ignore state_referenced_locally
	setNuciContext(ctx);
</script>

<Form bind:valid>
	<C {...props} />
</Form>
<span data-testid="form-valid">{valid}</span>
