<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Status → Kernel log: the ring buffer, then live follow over the `kernlog` stream. -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { isRpcError, type KernelLogEntry, type StreamParams } from '@nuci/rpc';
	import { LogView, Page, Section, type LogLine } from '@nuci/ui';
	import { onMount } from 'svelte';
	import { rpc } from '../../lib/services';

	const MAX = 4000;

	let entries = $state<KernelLogEntry[]>([]);
	let error = $state('');
	let last = -1;
	let follow = $state(true);

	function append(fresh: KernelLogEntry[]) {
		const add = fresh.filter((e) => e.time > last);
		if (!add.length) return;
		last = add.at(-1)!.time;
		entries = [...entries, ...add].slice(-MAX);
	}

	onMount(() => {
		let off: (() => void) | undefined;
		let gone = false;
		rpc.nuci.status
			.kernelLog()
			.then((log) => {
				entries = log.slice(-MAX);
				last = log.at(-1)?.time ?? -1;
			})
			.catch((e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)))
			.finally(() => {
				if (gone) return;
				off = rpc.events.subscribe('kernlog', (d) => append(d.entries), {
					params: (): StreamParams => (last >= 0 ? { after: last.toFixed(6) } : {}),
				});
			});
		return () => {
			gone = true;
			off?.();
		};
	});

	const lines: LogLine[] = $derived(
		entries.map((e, i) => ({
			key: `${e.time}-${i}`,
			time: `[${e.time.toFixed(6).padStart(12)}]`,
			level: e.priority,
			msg: e.msg,
		})),
	);
</script>

<Page title={t('kernlog.title')} description={t('kernlog.description')}>
	<Section>
		{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
		<LogView {lines} bind:follow filename="dmesg.txt" testid="kernlog" />
	</Section>
</Page>
