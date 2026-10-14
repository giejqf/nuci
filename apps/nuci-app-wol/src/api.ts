// SPDX-License-Identifier: Apache-2.0
// Typed wrappers for nuci.wol (AGENTS.md rule 5; fixture: docs/ubus-contracts/nuci.wol.json).

import type { HostContext } from '@nuci/app-sdk';

export interface Iface {
	name: string;
	mac: string | null;
	up: boolean;
	bridge: boolean;
	/** The bridge this interface is a port of. */
	master: string | null;
}
export interface KnownHost {
	macaddr: string;
	hostname?: string;
	ipv4: string[];
	ipv6: string[];
}
export interface WakeArgs {
	mac: string;
	interface: string;
	broadcast?: boolean;
	/** SecureOn password: 4 or 6 bytes in hex, or dotted. */
	password?: string;
}

export const wolApi = (host: HostContext) => ({
	interfaces: () =>
		host.call<{ program: string | null; interfaces: Iface[] }>('nuci.wol', 'interfaces'),
	wake: (args: WakeArgs) =>
		host.call<{ sent: boolean; mac: string; interface: string }>('nuci.wol', 'wake', {
			...args,
		}),
	hosts: () => host.call<{ hosts: KnownHost[] }>('nuci.dhcp', 'hosts'),
});

const HEX = /^[0-9a-f]{12}$/;
/** "AA-BB-CC-DD-EE-FF" and friends -> "aa:bb:cc:dd:ee:ff"; null when invalid. */
export function normalizeMac(s: string): string | null {
	const hex = s.toLowerCase().replace(/[:.-]/g, '');
	if (!HEX.test(hex) || /^0+$|^f+$/.test(hex)) return null;
	return hex.match(/../g)!.join(':');
}
export const macValidator = (v: string) => (v === '' || normalizeMac(v) ? null : 'wol.mac_invalid');
export const passwordValidator = (v: string) =>
	v === '' ||
	/^([0-9a-f]{2}[:-]?){3}[0-9a-f]{2}$|^([0-9a-f]{2}[:-]?){5}[0-9a-f]{2}$/i.test(v) ||
	/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(v)
		? null
		: 'wol.password_invalid';
