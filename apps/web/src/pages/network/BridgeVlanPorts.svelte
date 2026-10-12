<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Port membership of one bridge-vlan section: not a member / untagged / tagged, plus PVID. -->
<script lang="ts">
	import { t } from '@nuci/i18n';
	import { asList } from '@nuci/ui';
	import { uci } from '../../lib/services';
	import { parsePort, setPort, type PortMode } from './bridge-vlan';

	interface Props {
		section: string;
		/** Ports of the bridge this VLAN belongs to. */
		ports: string[];
		readonly?: boolean;
	}
	let { section, ports, readonly = false }: Props = $props();

	const specs = $derived(asList(uci.get('network', section, 'ports')));
	const byPort = $derived(new Map(specs.map((s) => [parsePort(s).port, parsePort(s)])));

	function update(port: string, mode: PortMode | null, pvid: boolean) {
		const next = setPort(specs, port, mode, pvid);
		uci.set('network', section, 'ports', next.length ? next : null);
	}
</script>

{#if ports.length === 0}
	<p class="text-base-content/70 text-sm">{t('network.no_bridge_ports')}</p>
{:else}
	<table class="table-sm table" data-testid="bvlan-ports">
		<caption class="text-left text-sm font-medium">{t('network.port_membership')}</caption>
		<thead>
			<tr>
				<th scope="col">{t('network.ports')}</th>
				<th scope="col">{t('network.membership')}</th>
				<th scope="col">{t('network.pvid')}</th>
			</tr>
		</thead>
		<tbody>
			{#each ports as port (port)}
				{@const p = byPort.get(port)}
				<tr>
					<th scope="row" class="font-mono font-normal">{port}</th>
					<td>
						<select
							class="select select-sm"
							aria-label={t('network.membership_of', { port })}
							value={p?.mode ?? ''}
							disabled={readonly}
							onchange={(e) => {
								const v = e.currentTarget.value as PortMode | '';
								update(port, v || null, v ? (p?.pvid ?? false) : false);
							}}
							data-testid="bvlan-port-{port}"
						>
							<option value="">{t('network.port_not_member')}</option>
							<option value="u">{t('network.port_untagged')}</option>
							<option value="t">{t('network.port_tagged')}</option>
						</select>
					</td>
					<td>
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							aria-label={t('network.pvid_of', { port })}
							checked={p?.pvid ?? false}
							disabled={readonly || !p}
							onchange={(e) => p && update(port, p.mode, e.currentTarget.checked)}
							data-testid="bvlan-pvid-{port}"
						/>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p class="text-base-content/70 text-xs">{t('network.pvid_help')}</p>
{/if}
