// SPDX-License-Identifier: Apache-2.0
// Shared option lists for the firewall pages (labels are i18n keys).

import { t } from '@nuci/i18n';
import type { UciStore } from '@nuci/uci';

export const POLICIES = ['ACCEPT', 'REJECT', 'DROP'];
export const policyOptions = () =>
	POLICIES.map((p) => ({ value: p, label: t(`firewall.policy.${p}`) }));

export function zoneOptions(uci: UciStore, extra: { value: string; label: string }[] = []) {
	return [
		...extra,
		...uci.sections('firewall', 'zone').map((z) => ({
			value: String(z.name ?? z['.name']),
			label: String(z.name ?? z['.name']),
		})),
	];
}

export const protoOptions = (withIcmp: boolean) => [
	{ value: 'tcp', label: 'TCP' },
	{ value: 'udp', label: 'UDP' },
	...(withIcmp ? [{ value: 'icmp', label: 'ICMP' }] : []),
];

export const familyOptions = () => [
	{ value: '', label: t('firewall.family.any') },
	{ value: 'ipv4', label: 'IPv4' },
	{ value: 'ipv6', label: 'IPv6' },
];

/** Display helper for list/space-separated uci values. */
export const show = (v: unknown) =>
	Array.isArray(v) ? v.join(' ') : v == null || v === '' ? '—' : String(v);
export const enabled = (v: unknown) => (v === '0' ? t('firewall.disabled') : t('firewall.enabled'));
