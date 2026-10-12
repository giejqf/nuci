// SPDX-License-Identifier: Apache-2.0
//
// netifd `bridge-vlan` port specs: "<port>[:u|:t][*]" — untagged (default) or
// tagged membership, "*" marks the port's primary VLAN (PVID). NuCI always
// writes the explicit form ("lan1:u*", "lan2:t").

export type PortMode = 'u' | 't';

export interface PortSpec {
	port: string;
	mode: PortMode;
	pvid: boolean;
}

export function parsePort(spec: string): PortSpec {
	const m = /^([^:*]+)(?::([ut]))?(\*)?$/.exec(spec.trim());
	if (!m) return { port: spec, mode: 'u', pvid: false };
	return { port: m[1] ?? spec, mode: (m[2] as PortMode | undefined) ?? 'u', pvid: !!m[3] };
}

export function formatPort(p: PortSpec): string {
	return `${p.port}:${p.mode}${p.pvid ? '*' : ''}`;
}

/** Set one port's membership (mode null removes it), keeping the others' order. */
export function setPort(
	specs: readonly string[],
	port: string,
	mode: PortMode | null,
	pvid: boolean,
): string[] {
	const parsed = specs.map(parsePort);
	const i = parsed.findIndex((p) => p.port === port);
	if (mode === null) return parsed.filter((p) => p.port !== port).map(formatPort);
	const next = { port, mode, pvid };
	if (i < 0) parsed.push(next);
	else parsed[i] = next;
	return parsed.map(formatPort);
}
