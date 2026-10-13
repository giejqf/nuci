// SPDX-License-Identifier: Apache-2.0
//
// Interface protocols are data (AGENTS.md §9 Phase 4): adding a protocol
// means adding an entry here, not a page. Labels are i18n keys.

import { validators, type Validator } from '@nuci/ui';

/** `interface`: a logical interface picker (e.g. a tunnel's underlay). */
export type FieldKind = 'text' | 'password' | 'number' | 'list' | 'select' | 'toggle' | 'interface';

export interface ProtoField {
	option: string;
	label: string;
	kind: FieldKind;
	description?: string;
	placeholder?: string;
	validate?: Validator;
	options?: { value: string; label: string }[];
	/** Toggle semantics. */
	on?: string;
	off?: string;
	default?: boolean;
	advanced?: boolean;
}

export interface Proto {
	id: string;
	label: string;
	fields: ProtoField[];
	/** Offers a DHCP server tab (LAN-side protocols). */
	dhcpServer?: boolean;
	/** Creates its own device (tunnels): no device selection. */
	noDevice?: boolean;
}

const v = validators;
const dnsField: ProtoField = {
	option: 'dns',
	label: 'proto.dns',
	kind: 'list',
	validate: v.ipaddr,
	advanced: true,
};
const peerdns: ProtoField = {
	option: 'peerdns',
	label: 'proto.peerdns',
	kind: 'toggle',
	default: true,
	advanced: true,
};
const defaultroute: ProtoField = {
	option: 'defaultroute',
	label: 'proto.defaultroute',
	kind: 'toggle',
	default: true,
	advanced: true,
};
const metric: ProtoField = {
	option: 'metric',
	label: 'proto.metric',
	kind: 'number',
	validate: v.integer(0, 9999),
	advanced: true,
};

const tunlink: ProtoField = {
	option: 'tunlink',
	label: 'proto.tunlink',
	kind: 'interface',
	description: 'proto.tunlink_help',
};
const tunnelMtu: ProtoField = {
	option: 'mtu',
	label: 'proto.mtu',
	kind: 'number',
	validate: v.integer(1280, 9000),
	placeholder: '1280',
	advanced: true,
};
const tunnelTtl: ProtoField = {
	option: 'ttl',
	label: 'proto.ttl',
	kind: 'number',
	validate: v.integer(1, 255),
	placeholder: '64',
	advanced: true,
};

export const PROTOS: Proto[] = [
	{
		id: 'static',
		label: 'proto.static',
		dhcpServer: true,
		fields: [
			{
				option: 'ipaddr',
				label: 'proto.ipaddr',
				kind: 'list',
				validate: v.all(v.required, v.cidr4),
				placeholder: '192.168.1.1/24',
				description: 'proto.ipaddr_help',
			},
			{ option: 'gateway', label: 'proto.gateway', kind: 'text', validate: v.ipv4 },
			{
				option: 'ip6addr',
				label: 'proto.ip6addr',
				kind: 'list',
				placeholder: 'fd00::1/64',
				advanced: true,
			},
			{
				option: 'ip6gw',
				label: 'proto.ip6gw',
				kind: 'text',
				validate: v.ipv6,
				advanced: true,
			},
			{
				option: 'ip6assign',
				label: 'proto.ip6assign',
				kind: 'number',
				validate: v.integer(0, 64),
				description: 'proto.ip6assign_help',
				advanced: true,
			},
			{ ...dnsField, advanced: false },
			metric,
		],
	},
	{
		id: 'dhcp',
		label: 'proto.dhcp',
		fields: [
			{
				option: 'hostname',
				label: 'proto.dhcp_hostname',
				kind: 'text',
				placeholder: '*',
				description: 'proto.dhcp_hostname_help',
			},
			{
				option: 'broadcast',
				label: 'proto.broadcast',
				kind: 'toggle',
				default: false,
				advanced: true,
			},
			{ option: 'clientid', label: 'proto.clientid', kind: 'text', advanced: true },
			{ option: 'vendorid', label: 'proto.vendorid', kind: 'text', advanced: true },
			peerdns,
			dnsField,
			defaultroute,
			metric,
		],
	},
	{
		id: 'dhcpv6',
		label: 'proto.dhcpv6',
		fields: [
			{
				option: 'reqaddress',
				label: 'proto.reqaddress',
				kind: 'select',
				options: ['try', 'force', 'none'].map((x) => ({
					value: x,
					label: `proto.reqaddress_${x}`,
				})),
			},
			{
				option: 'reqprefix',
				label: 'proto.reqprefix',
				kind: 'select',
				options: [
					{ value: 'auto', label: 'proto.reqprefix_auto' },
					{ value: 'no', label: 'proto.reqprefix_no' },
					...[48, 52, 56, 60, 62, 63, 64].map((n) => ({
						value: String(n),
						label: `/${n}`,
					})),
				],
			},
			peerdns,
			dnsField,
			defaultroute,
		],
	},
	{
		id: 'pppoe',
		label: 'proto.pppoe',
		fields: [
			{ option: 'username', label: 'proto.username', kind: 'text', validate: v.required },
			{ option: 'password', label: 'proto.password', kind: 'password' },
			{
				option: 'ac',
				label: 'proto.ac',
				kind: 'text',
				description: 'proto.ac_help',
				advanced: true,
			},
			{ option: 'service', label: 'proto.service', kind: 'text', advanced: true },
			{
				option: 'ipv6',
				label: 'proto.ppp_ipv6',
				kind: 'select',
				options: [
					{ value: 'auto', label: 'proto.ppp_ipv6_auto' },
					{ value: '1', label: 'proto.ppp_ipv6_on' },
					{ value: '0', label: 'proto.ppp_ipv6_off' },
				],
				advanced: true,
			},
			{
				option: 'keepalive',
				label: 'proto.keepalive',
				kind: 'text',
				placeholder: '5 1',
				description: 'proto.keepalive_help',
				advanced: true,
			},
			peerdns,
			dnsField,
			defaultroute,
			metric,
		],
	},
	{
		id: '6in4',
		label: 'proto.6in4',
		noDevice: true,
		fields: [
			{
				option: 'peeraddr',
				label: 'proto.tunnel_server',
				kind: 'text',
				validate: v.all(v.required, v.ipv4),
			},
			{
				option: 'ip6addr',
				label: 'proto.tunnel_local6',
				kind: 'text',
				validate: v.cidr6,
				placeholder: '2001:db8:1::2/64',
			},
			{ option: 'ip6prefix', label: 'proto.routed_prefix', kind: 'list', validate: v.cidr6 },
			tunlink,
			{
				option: 'tunnelid',
				label: 'proto.tunnelid',
				kind: 'text',
				description: 'proto.tunnelbroker_help',
				advanced: true,
			},
			{ option: 'username', label: 'proto.username', kind: 'text', advanced: true },
			{ option: 'password', label: 'proto.updatekey', kind: 'password', advanced: true },
			tunnelMtu,
			tunnelTtl,
			metric,
		],
	},
	{
		id: '6rd',
		label: 'proto.6rd',
		noDevice: true,
		fields: [
			{
				option: 'peeraddr',
				label: 'proto.border_relay',
				kind: 'text',
				validate: v.all(v.required, v.ipv4),
			},
			{
				option: 'ip6prefix',
				label: 'proto.6rd_prefix',
				kind: 'text',
				validate: v.all(v.required, v.ipv6),
				placeholder: '2001:db8::',
			},
			{
				option: 'ip6prefixlen',
				label: 'proto.6rd_prefixlen',
				kind: 'number',
				validate: v.all(v.required, v.integer(0, 64)),
			},
			{
				option: 'ip4prefixlen',
				label: 'proto.ip4prefixlen',
				kind: 'number',
				validate: v.integer(0, 32),
				placeholder: '0',
			},
			tunlink,
			tunnelMtu,
			tunnelTtl,
		],
	},
	{
		id: 'dslite',
		label: 'proto.dslite',
		noDevice: true,
		fields: [
			{
				option: 'peeraddr',
				label: 'proto.aftr',
				kind: 'text',
				validate: v.all(v.required, v.ipv6OrHost),
			},
			{ option: 'ip6addr', label: 'proto.tunnel_local6', kind: 'text', validate: v.ipv6 },
			tunlink,
			{
				option: 'encaplimit',
				label: 'proto.encaplimit',
				kind: 'text',
				placeholder: 'ignore',
				advanced: true,
			},
			tunnelMtu,
		],
	},
	{
		id: 'ipip',
		label: 'proto.ipip',
		noDevice: true,
		fields: [
			{
				option: 'peeraddr',
				label: 'proto.remote_ipv4',
				kind: 'text',
				validate: v.all(v.required, v.ipv4),
			},
			{
				option: 'ipaddr',
				label: 'proto.local_ipv4',
				kind: 'text',
				validate: v.ipv4,
				description: 'proto.local_ipv4_help',
			},
			tunlink,
			tunnelMtu,
			tunnelTtl,
		],
	},
	{ id: 'none', label: 'proto.none', fields: [] },
];

export function proto(id: string | undefined): Proto | undefined {
	return PROTOS.find((p) => p.id === id);
}

/**
 * Protocols to offer: those netifd has handlers for (`none` is built in),
 * plus the interface's current one. Unknown handlers (null) offer all.
 */
export function availableProtos(
	handlers: Record<string, unknown> | null,
	current?: string,
): Proto[] {
	if (!handlers) return PROTOS;
	return PROTOS.filter((p) => p.id === 'none' || p.id === current || p.id in handlers);
}

/**
 * Options of `from` that `to` does not use the same way (unset when
 * switching): a name both share with a different meaning (static's address
 * list vs. a tunnel's local `ipaddr`) is dropped too.
 */
export function obsoleteOptions(from: string | undefined, to: string): string[] {
	const keep = new Map((proto(to)?.fields ?? []).map((f) => [f.option, f.label]));
	return (proto(from)?.fields ?? [])
		.filter((f) => keep.get(f.option) !== f.label)
		.map((f) => f.option);
}
