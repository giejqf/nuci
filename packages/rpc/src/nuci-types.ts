// SPDX-License-Identifier: Apache-2.0
//
// Response shapes of the nuci.* ubus objects (rpcd/ucode/nuci-*.uc).

export interface AppManifest {
	id: string;
	title: string;
	icon: string | null;
	entry: string;
	version: string | null;
	menu: { group: string; order: number };
	acls: string[];
}

export interface NetCounters {
	rx_bytes: number;
	rx_packets: number;
	tx_bytes: number;
	tx_packets: number;
}

export interface RealtimeStats {
	/** Seconds since boot, with sub-second precision. */
	uptime: number;
	/** Load averages as decimals (1, 5, 15 min). */
	load: [number, number, number];
	/** Cumulative CPU jiffies; usage is the delta between samples. */
	cpu: {
		user: number;
		nice: number;
		system: number;
		idle: number;
		iowait: number;
		irq: number;
		softirq: number;
		steal: number;
	};
	memory: {
		total: number;
		free: number;
		available: number;
		buffers: number;
		cached: number;
		swap_total: number;
		swap_free: number;
	};
	interfaces: Record<string, NetCounters>;
	conntrack: { count: number; max: number };
}

export interface ProcessInfo {
	pid: number;
	ppid: number;
	user: string;
	state: string;
	/** Resident set size in KiB. */
	rss: number;
	/** Virtual size in KiB. */
	vsz: number;
	/** CPU ticks (utime + stime) since start; usage is the delta between samples. */
	cpu_ticks: number;
	command: string;
}

export interface KernelLogEntry {
	/** Seconds since boot. */
	time: number;
	facility: number;
	priority: number;
	msg: string;
}

export interface ConntrackEntry {
	family: 'ipv4' | 'ipv6';
	protocol: string;
	src: string;
	dst: string;
	sport?: number;
	dport?: number;
	bytes: number;
	packets: number;
	state?: string;
	timeout: number;
}

export interface LocalTime {
	localtime: number;
	zonename: string;
	timezone: string;
}

export interface Led {
	name: string;
	brightness: number;
	max_brightness: number;
	trigger: string;
	triggers: string[];
}

export interface BlockDevice {
	device: string;
	uuid?: string;
	label?: string;
	type?: string;
	version?: string;
	mount?: string;
	size?: number;
}

export interface MountPoint {
	device: string;
	mount: string;
	type: string;
	options: string[];
	/** KiB */
	size: number;
	used: number;
	avail: number;
}

export interface UsbDevice {
	bus: number;
	device: number;
	vendor_id: string;
	product_id: string;
	manufacturer?: string;
	product?: string;
	speed?: string;
}

export interface DhcpLease {
	family: 'ipv4' | 'ipv6';
	address: string;
	macaddr?: string;
	duid?: string;
	hostname?: string;
	/** Seconds until expiry; -1 for static/infinite leases. */
	expires: number;
	interface?: string;
}

export interface KnownHost {
	macaddr: string;
	hostname?: string;
	ipv4: string[];
	ipv6: string[];
}
