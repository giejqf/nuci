// SPDX-License-Identifier: Apache-2.0
//
// Typed wrappers over RpcClient for the stock ubus objects and nuci.*.
// Argument names follow the signatures in docs/ubus-contracts/*.json.

import { Acl } from './acl';
import type { RpcClient } from './client';
import { RpcError } from './errors';
import type {
	AppManifest,
	BackupStatus,
	BlockDevice,
	ConntrackEntry,
	ConntrackSummary,
	DhcpLease,
	InstalledPackages,
	JobStatus,
	KernelLogEntry,
	KnownHost,
	Led,
	LocalTime,
	MountPoint,
	NuciUser,
	PackageInfo,
	PackagePage,
	ProcessList,
	RealtimeStats,
	ScanResult,
	UsbDevice,
	WifiDeviceStats,
	WifiStation,
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
	ProcdService,
	ProtoHandler,
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
			/**
			 * Init scripts. rpcd's running check spawns a shell per script (tens of
			 * seconds on small routers); skip it and ask procd via service.list().
			 */
			list: (skipRunningCheck = false) =>
				call<Record<string, InitScript>>(
					'rc',
					'list',
					skipRunningCheck ? { skip_running_check: true } : {},
				),
			init: (
				name: string,
				action: 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable',
			) => call('rc', 'init', { name, action }),
		},

		service: {
			/** procd services and their instances (one call for all). */
			list: () => call<Record<string, ProcdService>>('service', 'list'),
		},

		network: {
			async interfaces(): Promise<InterfaceStatus[]> {
				return (await call<{ interface: InterfaceStatus[] }>('network.interface', 'dump'))
					.interface;
			},
			interface: (name: string) =>
				call<InterfaceStatus>(`network.interface.${name}`, 'status'),
			up: (name: string) => call(`network.interface.${name}`, 'up'),
			down: (name: string) => call(`network.interface.${name}`, 'down'),
			renew: (name: string) => call(`network.interface.${name}`, 'renew'),
			devices: () => call<Record<string, DeviceStatus>>('network.device', 'status'),
			/** Installed netifd protocol handlers with their option schemas. */
			protoHandlers: () =>
				call<Record<string, ProtoHandler>>('network', 'get_proto_handlers'),
			device: (name: string) => call<DeviceStatus>('network.device', 'status', { name }),
			/**
			 * Radio status via nuci.wifi (netifd rejects calls that carry the
			 * session argument). Empty when the router has no wireless.
			 */
			async wireless(): Promise<Record<string, WirelessRadio>> {
				try {
					return await call<Record<string, WirelessRadio>>('nuci.wifi', 'status');
				} catch (e) {
					if (e instanceof RpcError && e.isNotFound) return {};
					throw e;
				}
			},
		},

		/** Per-device wireless stats, the same shape as the `wifi` stream. */
		async wifiStats(): Promise<Record<string, WifiDeviceStats>> {
			let devices: string[];
			try {
				devices = (await call<{ devices: string[] }>('iwinfo', 'devices')).devices;
			} catch (e) {
				if (e instanceof RpcError && e.isNotFound) return {};
				throw e;
			}
			const rows = await Promise.all(
				devices.map(async (device) => {
					const [info, assoc] = await Promise.all([
						call<IwinfoInfo>('iwinfo', 'info', { device }),
						call<{ results: IwinfoStation[] }>('iwinfo', 'assoclist', { device }).catch(
							() => ({ results: [] }),
						),
					]);
					const {
						ssid,
						mode,
						channel,
						frequency,
						signal,
						noise,
						bitrate,
						quality,
						quality_max,
						txpower,
					} = info;
					return [
						device,
						{
							ssid,
							mode,
							channel,
							frequency,
							signal,
							noise,
							bitrate,
							quality,
							quality_max,
							txpower,
							stations: assoc.results.length,
						},
					] as const;
				}),
			);
			return Object.fromEntries(rows) as Record<string, WifiDeviceStats>;
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

		rpcSys: {
			passwordSet: (user: string, password: string) =>
				call('rpc-sys', 'password_set', { user, password }),
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
				processes: () => call<ProcessList>('nuci.status', 'processes'),
				/** Kernel log, optionally only entries after `after` seconds since boot. */
				kernelLog: async (after?: number) =>
					(
						await call<{ log: KernelLogEntry[] }>(
							'nuci.status',
							'kernel_log',
							after === undefined ? {} : { after: after.toFixed(6) },
						)
					).log,
				conntrackSummary: () => call<ConntrackSummary>('nuci.status', 'conntrack_summary'),
				signal: (pid: number, signal: number) =>
					call('nuci.status', 'signal', { pid, signal }),
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
			pkg: {
				listInstalled: () => call<InstalledPackages>('nuci.pkg', 'list_installed'),
				listAvailable: (offset = 0, limit = 100) =>
					call<PackagePage>('nuci.pkg', 'list_available', { offset, limit }),
				search: async (query: string) =>
					(await call<{ packages: PackageInfo[] }>('nuci.pkg', 'search', { query }))
						.packages,
				info: (name: string) => call<PackageInfo>('nuci.pkg', 'info', { name }),
				update: () => call<JobStatus>('nuci.pkg', 'update'),
				add: (packages: string[], upgrade = false) =>
					call<JobStatus>(
						'nuci.pkg',
						'add',
						upgrade ? { packages, upgrade } : { packages },
					),
				del: (packages: string[]) => call<JobStatus>('nuci.pkg', 'del', { packages }),
				jobStatus: () => call<JobStatus>('nuci.pkg', 'job_status'),
			},
			wifi: {
				stations: async () =>
					(await call<{ stations: WifiStation[] }>('nuci.wifi', 'assoc_list_enriched'))
						.stations,
				scan: async (radio: string) =>
					(await call<{ results: ScanResult[] }>('nuci.wifi', 'scan', { radio })).results,
			},
			diag: {
				ping: (host: string, count = 4, family?: 4 | 6) =>
					call<JobStatus>(
						'nuci.diag',
						'ping',
						family ? { host, count, family } : { host, count },
					),
				traceroute: (host: string, family?: 4 | 6) =>
					call<JobStatus>(
						'nuci.diag',
						'traceroute',
						family ? { host, family } : { host },
					),
				nslookup: (host: string, server?: string) =>
					call<JobStatus>('nuci.diag', 'nslookup', server ? { host, server } : { host }),
				status: () => call<JobStatus>('nuci.diag', 'status'),
			},
			users: {
				list: async () => (await call<{ users: NuciUser[] }>('nuci.users', 'list')).users,
				/** Installed ACL groups (name -> description). */
				groups: async () =>
					(await call<{ groups: Record<string, string> }>('nuci.users', 'groups')).groups,
				create: (user: {
					username: string;
					password: string;
					read: string[];
					write: string[];
				}) => call<{ username: string }>('nuci.users', 'create', user),
				update: (user: { username: string; read: string[]; write: string[] }) =>
					call<{ username: string }>('nuci.users', 'update', user),
				setPassword: (username: string, password: string) =>
					call<{ username: string }>('nuci.users', 'set_password', {
						username,
						password,
					}),
				delete: (username: string) =>
					call<{ username: string }>('nuci.users', 'delete', { username }),
			},
			firewall: {
				/** Ruleset fw4 would generate from the committed config. */
				preview: () =>
					call<{ text: string; truncated: boolean }>('nuci.firewall', 'preview'),
				/** Live nftables ruleset. */
				ruleset: () =>
					call<{ text: string; truncated: boolean }>('nuci.firewall', 'ruleset'),
			},
			backup: {
				create: () => call<BackupStatus>('nuci.system', 'backup_create'),
				status: () => call<BackupStatus>('nuci.system', 'backup_status'),
				restore: () => call<JobStatus>('nuci.system', 'backup_restore'),
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
