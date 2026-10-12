<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Status → System log: logd history, then live follow over the `syslog` stream. -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { isRpcError, type LogEntry } from '@nuci/rpc';
	import { LogView, Page, Section, type LogLine } from '@nuci/ui';
	import { onMount } from 'svelte';
	import { rpc } from '../../lib/services';

	const MAX = 2000;
	const FACILITIES = [
		'kern',
		'user',
		'mail',
		'daemon',
		'auth',
		'syslog',
		'lpr',
		'news',
		'uucp',
		'cron',
		'authpriv',
		'ftp',
	];

	let entries = $state<LogEntry[]>([]);
	let error = $state('');
	let lastId = -1;
	let follow = $state(true);

	function append(fresh: LogEntry[]) {
		const add = fresh.filter((e) => e.id > lastId);
		if (!add.length) return;
		lastId = add.at(-1)!.id;
		entries = [...entries, ...add].slice(-MAX);
	}

	onMount(() => {
		let off: (() => void) | undefined;
		let gone = false;
		rpc.log
			.read(500)
			.then((log) => append(log))
			.catch((e) => (error = isRpcError(e) ? t(e.messageKey) : String(e)))
			.finally(() => {
				if (gone) return;
				off = rpc.events.subscribe('syslog', (d) => append(d.entries), {
					params: () => ({ after: lastId }),
				});
			});
		return () => {
			gone = true;
			off?.();
		};
	});

	const lines: LogLine[] = $derived(
		entries.map((e) => ({
			key: e.id,
			time: new Date(e.time).toLocaleString(),
			level: e.priority & 7,
			source: FACILITIES[e.priority >> 3] ?? String(e.priority >> 3),
			msg: e.msg,
		})),
	);
</script>

<Page title={t('syslog.title')} description={t('syslog.description')}>
	<Section>
		{#if error}<div role="alert" class="alert alert-error">{error}</div>{/if}
		<LogView {lines} bind:follow filename="syslog.txt" testid="syslog" />
	</Section>
</Page>
