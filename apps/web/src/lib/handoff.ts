// SPDX-License-Identifier: Apache-2.0
//
// New-address handoff (ADR-0002 §6): when an apply moves the address the
// browser is using, the old origin can no longer confirm. We probe the new
// address (/nuci/probe allows CORS) and hand the session over to it with a
// top-level navigation to #/apply/confirm/<sid>; the new origin confirms.

import { asList } from '@nuci/ui';
import type { UciStore } from '@nuci/uci';

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

export function stripPrefix(cidr: string): string {
	return cidr.split('/')[0] ?? cidr;
}

/** Literal IPv4 host the browser uses, or null (DNS names, ports via NAT, IPv6). */
export function browserAddress(hostname: string): string | null {
	return IPV4.test(hostname) ? hostname : null;
}

/** IPv4 addresses per interface in the (staged) uci view. */
export function configuredAddresses(uci: Pick<UciStore, 'sections'>): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const s of uci.sections('network', 'interface')) {
		if (s.proto !== 'static') continue;
		out.set(s['.name'], asList(s.ipaddr as string | string[] | undefined).map(stripPrefix));
	}
	return out;
}

/**
 * If the staged config removes `current` from the interface that carries it
 * live, return the interface's new first address (the handoff target).
 */
export function handoffTarget(
	current: string | null,
	liveIface: string | null,
	staged: Map<string, string[]>,
): string | null {
	if (!current || !liveIface) return null;
	for (const addrs of staged.values()) if (addrs.includes(current)) return null;
	return staged.get(liveIface)?.[0] ?? null;
}

export const HANDOFF_RE = /^#\/apply\/confirm\/([0-9a-f]{32})$/;

export function handoffUrl(
	host: string,
	sid: string,
	location: Pick<Location, 'protocol' | 'port' | 'pathname'>,
): string {
	const port = location.port ? `:${location.port}` : '';
	return `${location.protocol}//${host}${port}${location.pathname}#/apply/confirm/${sid}`;
}
