// SPDX-License-Identifier: Apache-2.0
//
// Response shapes of the stock ubus objects NuCI uses, written against the
// fixtures in docs/ubus-contracts/ (recorded from OpenWrt 25.12).

export interface BoardInfo {
	kernel: string;
	hostname: string;
	system: string;
	model: string;
	board_name: string;
	rootfs_type?: string;
	release: {
		distribution: string;
		version: string;
		revision: string;
		target: string;
		description: string;
		builddate?: string;
		firmware_url?: string;
	};
}

export interface FsUsage {
	total: number;
	free: number;
	used: number;
	avail: number;
}

export interface SystemInfo {
	localtime: number;
	uptime: number;
	/** 1/5/15 min load averages, fixed point × 65536. */
	load: [number, number, number];
	memory: {
		total: number;
		free: number;
		shared: number;
		buffered: number;
		available?: number;
		cached?: number;
	};
	root?: FsUsage;
	tmp?: FsUsage;
	swap?: { total: number; free: number };
}

export type AclMap = Record<string, Record<string, string[]>>;

export interface LoginResult {
	ubus_rpc_session: string;
	timeout: number;
	expires: number;
	acls: AclMap;
	data: { username?: string };
}

/** A uci section as returned by `uci get`; option values are strings or lists. */
export interface UciSection {
	'.anonymous': boolean;
	'.type': string;
	'.name': string;
	'.index'?: number;
	[option: string]: string | string[] | boolean | number | undefined;
}

export type UciValues = Record<string, UciSection>;

/** One entry of `network get_proto_handlers` (netifd). */
export interface ProtoHandler {
	/** Option name -> netifd type ("string", "uinteger", "list(string)", ...). */
	validate: Record<string, string>;
	no_device?: boolean;
	immediate?: boolean;
	[flag: string]: unknown;
}

export interface UciChange {
	0: 'set' | 'add' | 'remove' | 'rename' | 'list-add' | 'list-del' | 'order' | string;
	1: string;
	2?: string;
	3?: string;
}

export interface IpAddress {
	address: string;
	mask: number;
}

export interface InterfaceRoute {
	target: string;
	mask: number;
	nexthop: string;
	source?: string;
	metric?: number;
}

export interface InterfaceStatus {
	interface: string;
	up: boolean;
	pending: boolean;
	available: boolean;
	autostart: boolean;
	dynamic: boolean;
	uptime?: number;
	l3_device?: string;
	proto: string;
	device?: string;
	metric?: number;
	'ipv4-address'?: IpAddress[];
	'ipv6-address'?: IpAddress[];
	'ipv6-prefix'?: (IpAddress & { class?: string })[];
	'ipv6-prefix-assignment'?: (IpAddress & { 'local-address'?: IpAddress })[];
	route?: InterfaceRoute[];
	'dns-server'?: string[];
	'dns-search'?: string[];
	data?: Record<string, unknown>;
	errors?: { subsystem: string; code: string }[];
}

export interface DeviceStatus {
	type?: string;
	/** Bridges with VLAN filtering: port specs as netifd reports them ("eth0:t", "lan1:*"). */
	'bridge-vlans'?: { id: number; local?: boolean; ports: string[] }[];
	devtype?: string;
	present: boolean;
	up: boolean;
	carrier: boolean;
	external?: boolean;
	mtu?: number;
	macaddr?: string;
	speed?: string;
	'bridge-members'?: string[];
	statistics?: Record<string, number>;
	[key: string]: unknown;
}

export interface WirelessInterface {
	section?: string;
	ifname?: string;
	config: Record<string, unknown>;
	vlans?: unknown[];
	stations?: unknown[];
}

export interface WirelessRadio {
	up: boolean;
	pending: boolean;
	autostart: boolean;
	disabled: boolean;
	retry_setup_failed?: boolean;
	config: Record<string, unknown>;
	interfaces: WirelessInterface[];
}

export interface IwinfoInfo {
	phy?: string;
	ssid?: string;
	bssid?: string;
	mode?: string;
	channel?: number;
	frequency?: number;
	txpower?: number;
	quality?: number;
	quality_max?: number;
	signal?: number;
	noise?: number;
	bitrate?: number;
	encryption?: { enabled: boolean; [k: string]: unknown };
	hwmodes?: string[];
	country?: string;
	[key: string]: unknown;
}

export interface IwinfoStation {
	mac: string;
	signal?: number;
	noise?: number;
	inactive?: number;
	rx?: { rate?: number; mcs?: number; [k: string]: unknown };
	tx?: { rate?: number; mcs?: number; [k: string]: unknown };
	[key: string]: unknown;
}

/** One entry of procd's `service list`. */
export interface ProcdService {
	instances?: Record<string, { running: boolean; pid?: number }>;
	[key: string]: unknown;
}

export interface InitScript {
	start?: number;
	stop?: number;
	enabled: boolean;
	running?: boolean;
}

export interface LogEntry {
	msg: string;
	id: number;
	priority: number;
	source: number;
	/** Milliseconds since the epoch. */
	time: number;
}

export interface FileStat {
	path: string;
	type: 'file' | 'directory' | 'char' | 'block' | 'fifo' | 'symlink' | 'socket' | 'unknown';
	size: number;
	mode: number;
	atime: number;
	mtime: number;
	ctime: number;
	inode: number;
	uid: number;
	gid: number;
}

export interface FileEntry {
	name: string;
	type: FileStat['type'];
	size: number;
	mode: number;
	mtime: number;
	[key: string]: unknown;
}

export interface Dhcp6Lease {
	duid: string;
	iaid: number;
	hostname: string;
	accept_reconf: boolean;
	assigned: number;
	flags: string[];
	'ipv6-addr'?: { address: string; 'preferred-lifetime': number; 'valid-lifetime': number }[];
	'ipv6-prefix'?: { address: string; 'preferred-lifetime': number; 'valid-lifetime': number }[];
	valid: number;
}
