// SPDX-License-Identifier: Apache-2.0
//
// Typed wrappers over RpcClient for the stock ubus objects and nuci.*.
// Argument names follow the signatures in docs/ubus-contracts/*.json.

import { Acl } from './acl';
import type { RpcClient } from './client';
import { RpcError } from './errors';
import type {
	AppManifest,
	BlockDevice,
	ConntrackEntry,
	DhcpLease,
	KernelLogEntry,
	KnownHost,
	Led,
	LocalTime,
	MountPoint,
	ProcessInfo,
	RealtimeStats,
	UsbDevice,
} from './nuci-types';
import type {
	AclMap,
	BoardInfo,
	DeviceStatus,
	Dhcp6Lease,
	FileEntry,
	FileStat,
	InitScript,
	InterfaceStatus,
	IwinfoInfo,
	IwinfoStation,
	LogEntry,
	LoginResult,
	SystemInfo,
	UciSection,
	UciValues,
	WirelessRadio,
} from './types';

export type UciSetValues = Record<string, string | string[]>;

export function createApi(client: RpcClient) {
	const call = client.call.bind(client);

	return {
		session: {
			/** Log in; on success the client switches to the new session. */
			async login(username: string, password: string, timeout = 3600): Promise<LoginResult> {
				const res = await client.callAnonymous<LoginResult>('session', 'login', {
					username,
					password,
					timeout,
				});
				client.setSession(res.ubus_rpc_session);
				return res;
			},
			async logout(): Promise<void> {
				try {
					if (client.authenticated) await call('session', 'destroy', {});
				} finally {
					client.setSession(null);
				}
			},
			async access(): Promise<Acl> {
				return new Acl(await call<AclMap>('session', 'access', {}));
			},
			async check(scope: string, object: string, fn: string): Promise<boolean> {
				const r = await call<{ access: boolean }>('session', 'access', {
					scope,
					object,
					function: fn,
				});
				return r.access;
			},
		},

		system: {
			board: () => client.callAnonymous<BoardInfo>('system', 'board'),
			info: () => call<SystemInfo>('system', 'info'),
			reboot: () => call<Record<string, never>>('system', 'reboot'),
			validateFirmwareImage: (path: string) =>
				call<{
					valid: boolean;
					forceable: boolean;
					allow_backup: boolean;
					tests: Record<string, boolean>;
				}>('system', 'validate_firmware_image', { path }),
			sysupgrade: (args: {
				path: string;
				force?: boolean;
				backup?: string;
				options?: Record<string, unknown>;
			}) => call('system', 'sysupgrade', args),
		},

		uci: {
			configs: async () => (await call<{ configs: string[] }>('uci', 'configs')).configs,
			async getAll(config: string): Promise<UciValues> {
				return (await call<{ values: UciValues }>('uci', 'get', { config })).values;
			},
			async getSection(config: string, section: string): Promise<UciSection> {
				return (await call<{ values: UciSection }>('uci', 'get', { config, section }))
					.values;
			},
			async get(config: string, section: string, option: string): Promise<string | string[]> {
				return (
					await call<{ value: string | string[] }>('uci', 'get', {
						config,
						section,
						option,
					})
				).value;
			},
			async changes(config?: string): Promise<Record<string, [string, ...string[]][]>> {
				const r = await call<{ changes: Record<string, [string, ...string[]][]> }>(
					'uci',
					'changes',
					config ? { config } : {},
				);
				return r.changes ?? {};
			},
			set: (config: string, section: string, values: UciSetValues) =>
				call('uci', 'set', { config, section, values }),
			async add(
				config: string,
				type: string,
				values?: UciSetValues,
				name?: string,
			): Promise<string> {
				const args: Record<string, unknown> = { config, type };
				if (values) args.values = values;
				if (name) args.name = name;
				return (await call<{ section: string }>('uci', 'add', args)).section;
			},
			delete: (config: string, section: string, options?: string[]) =>
				call('uci', 'delete', options ? { config, section, options } : { config, section }),
			rename: (config: string, section: string, name: string, option?: string) =>
				call(
					'uci',
					'rename',
					option ? { config, section, option, name } : { config, section, name },
				),
			order: (config: string, sections: string[]) =>
				call('uci', 'order', { config, sections }),
			revert: (config: string) => call('uci', 'revert', { config }),
			commit: (config: string) => call('uci', 'commit', { config }),
			apply: (rollback: boolean, timeout?: number) =>
				call('uci', 'apply', timeout === undefined ? { rollback } : { rollback, timeout }),
			confirm: () => call('uci', 'confirm'),
			rollback: () => call('uci', 'rollback'),
		},

		file: {
			read: async (path: string, base64 = false) =>
				(await call<{ data: string }>('file', 'read', { path, base64 })).data,
			write: (
				path: string,
				data: string,
				opts: { append?: boolean; mode?: number; base64?: boolean } = {},
			) => call('file', 'write', { path, data, ...opts }),
			list: async (path: string) =>
				(await call<{ entries: FileEntry[] }>('file', 'list', { path })).entries,
			stat: (path: string) => call<FileStat>('file', 'stat', { path }),
			remove: (path: string) => call('file', 'remove', { path }),
			exec: (command: string, params: string[] = [], env?: Record<string, string>) =>
				call<{ code: number; stdout?: string; stderr?: string }>(
					'file',
					'exec',
					env ? { command, params, env } : { command, params },
				),
		},

		rc: {
			list: () => call<Record<string, InitScript>>('rc', 'list'),
			init: (
				name: string,
				action: 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable',
			) => call('rc', 'init', { name, action }),
		},

		network: {
			async interfaces(): Promise<InterfaceStatus[]> {
				return (await call<{ interface: InterfaceStatus[] }>('network.interface', 'dump'))
					.interface;
			},
			interface: (name: string) =>
				call<InterfaceStatus>(`network.interface.${name}`, 'status'),
			devices: () => call<Record<string, DeviceStatus>>('network.device', 'status'),
			device: (name: string) => call<DeviceStatus>('network.device', 'status', { name }),
			/** Radio status; empty when the router has no wireless (the object is absent). */
			async wireless(): Promise<Record<string, WirelessRadio>> {
				try {
					return await call<Record<string, WirelessRadio>>('network.wireless', 'status');
				} catch (e) {
					if (e instanceof RpcError && e.isNotFound) return {};
					throw e;
				}
			},
		},

		iwinfo: {
			devices: async () => (await call<{ devices: string[] }>('iwinfo', 'devices')).devices,
			info: (device: string) => call<IwinfoInfo>('iwinfo', 'info', { device }),
			assoclist: async (device: string) =>
				(await call<{ results: IwinfoStation[] }>('iwinfo', 'assoclist', { device }))
					.results,
			scan: async (device: string) =>
				(await call<{ results: Record<string, unknown>[] }>('iwinfo', 'scan', { device }))
					.results,
		},

		log: {
			async read(lines?: number): Promise<LogEntry[]> {
				const args: Record<string, unknown> = { stream: false, oneshot: true };
				if (lines !== undefined) args.lines = lines;
				return (await call<{ log: LogEntry[] }>('log', 'read', args)).log;
			},
		},

		dhcp: {
			ipv6leases: () =>
				call<{ device: Record<string, { leases: Dhcp6Lease[] }> }>('dhcp', 'ipv6leases'),
		},

		nuci: {
			apps: {
				list: async () => (await call<{ apps: AppManifest[] }>('nuci.apps', 'list')).apps,
			},
			status: {
				realtime: () => call<RealtimeStats>('nuci.status', 'realtime'),
				processes: async () =>
					(await call<{ processes: ProcessInfo[] }>('nuci.status', 'processes'))
						.processes,
				kernelLog: async () =>
					(await call<{ log: KernelLogEntry[] }>('nuci.status', 'kernel_log')).log,
				conntrack: async () =>
					(await call<{ connections: ConntrackEntry[] }>('nuci.status', 'conntrack'))
						.connections,
			},
			system: {
				timezones: async () =>
					(await call<{ zones: Record<string, string> }>('nuci.system', 'timezones'))
						.zones,
				localtime: () => call<LocalTime>('nuci.system', 'localtime'),
				setLocaltime: (localtime: number) =>
					call('nuci.system', 'set_localtime', { localtime }),
				leds: async () => (await call<{ leds: Led[] }>('nuci.system', 'leds')).leds,
				blockDevices: async () =>
					(await call<{ devices: BlockDevice[] }>('nuci.system', 'block_devices'))
						.devices,
				mountPoints: async () =>
					(await call<{ mounts: MountPoint[] }>('nuci.system', 'mount_points')).mounts,
				usbDevices: async () =>
					(await call<{ devices: UsbDevice[] }>('nuci.system', 'usb_devices')).devices,
			},
			dhcp: {
				leases: async () =>
					(await call<{ leases: DhcpLease[] }>('nuci.dhcp', 'leases')).leases,
				hosts: async () => (await call<{ hosts: KnownHost[] }>('nuci.dhcp', 'hosts')).hosts,
			},
		},
	};
}

export type Api = ReturnType<typeof createApi>;
