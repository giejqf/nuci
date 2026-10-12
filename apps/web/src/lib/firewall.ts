// SPDX-License-Identifier: Apache-2.0
//
// Interface <-> firewall zone assignment (zone `network` lists).

import { asList } from '@nuci/ui';
import type { UciStore } from '@nuci/uci';

export function zones(uci: UciStore): { section: string; name: string; networks: string[] }[] {
	return uci.sections('firewall', 'zone').map((z) => ({
		section: z['.name'],
		name: String(z.name ?? z['.name']),
		networks: asList(uci.get('firewall', z['.name'], 'network')),
	}));
}

export function zoneOf(uci: UciStore, iface: string): string | null {
	return zones(uci).find((z) => z.networks.includes(iface))?.name ?? null;
}

/** Move `iface` into `zone` (by name), or out of every zone when null. */
export function setZone(uci: UciStore, iface: string, zone: string | null): void {
	for (const z of zones(uci)) {
		const has = z.networks.includes(iface);
		if (z.name === zone && !has)
			uci.set('firewall', z.section, 'network', [...z.networks, iface]);
		if (z.name !== zone && has)
			uci.set(
				'firewall',
				z.section,
				'network',
				z.networks.filter((n) => n !== iface),
			);
	}
}

/** Rename an interface inside every zone. */
export function renameInZones(uci: UciStore, from: string, to: string): void {
	for (const z of zones(uci))
		if (z.networks.includes(from))
			uci.set(
				'firewall',
				z.section,
				'network',
				z.networks.map((n) => (n === from ? to : n)),
			);
}
