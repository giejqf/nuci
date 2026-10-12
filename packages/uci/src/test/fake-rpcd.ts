// SPDX-License-Identifier: Apache-2.0
// In-memory model of rpcd's uci object semantics (see ADR-0002) for tests.

import { RpcError, type UciSection, type UciSetValues, type UciValues } from '@nuci/rpc';
import type { UciApi } from '../model';

type Configs = Record<string, UciValues>;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class FakeRpcdUci implements UciApi {
	committed: Configs;
	staged: Configs;
	log: [string, ...unknown[]][] = [];
	changesList: Record<string, [string, ...string[]][]> = {};
	snapshot: {
		committed: Configs;
		staged: Configs;
		changes: Record<string, [string, ...string[]][]>;
	} | null = null;
	#n = 0;

	constructor(configs: Configs) {
		this.committed = clone(configs);
		this.staged = clone(configs);
	}

	#change(config: string, ...c: [string, ...string[]]) {
		(this.changesList[config] ??= []).push(c);
	}

	async getAll(config: string): Promise<UciValues> {
		this.log.push(['getAll', config]);
		if (!this.staged[config]) throw new RpcError('ubus', 4, 'uci', 'get');
		return clone(this.staged[config]);
	}

	async changes(): Promise<Record<string, [string, ...string[]][]>> {
		return clone(this.changesList);
	}

	async set(config: string, section: string, values: UciSetValues): Promise<unknown> {
		this.log.push(['set', config, section, values]);
		const s = this.staged[config]?.[section];
		if (!s) throw new RpcError('ubus', 4, 'uci', 'set');
		for (const [k, v] of Object.entries(values)) {
			s[k] = v;
			this.#change(config, 'set', section, k, Array.isArray(v) ? v.join(' ') : v);
		}
		return {};
	}

	async add(config: string, type: string, values?: UciSetValues, name?: string): Promise<string> {
		this.log.push(['add', config, type, values ?? {}, name]);
		const cfg = (this.staged[config] ??= {});
		const section = name ?? `cfg${(++this.#n).toString(16).padStart(6, '0')}`;
		if (cfg[section]) throw new RpcError('ubus', 2, 'uci', 'add');
		const index = Object.keys(cfg).length;
		cfg[section] = {
			'.name': section,
			'.type': type,
			'.anonymous': !name,
			'.index': index,
			...(values ?? {}),
		} as UciSection;
		this.#change(config, 'add', section, type);
		return section;
	}

	async delete(config: string, section: string, options?: string[]): Promise<unknown> {
		this.log.push(['delete', config, section, options]);
		const cfg = this.staged[config];
		if (!cfg?.[section]) throw new RpcError('ubus', 4, 'uci', 'delete');
		if (options) for (const o of options) delete cfg[section]![o];
		else delete cfg[section];
		this.#change(config, 'remove', section, ...(options ?? []));
		return {};
	}

	async order(config: string, sections: string[]): Promise<unknown> {
		this.log.push(['order', config, sections]);
		sections.forEach((n, i) => {
			const s = this.staged[config]?.[n];
			if (s) s['.index'] = i;
		});
		this.#change(config, 'order', ...sections);
		return {};
	}

	async revert(config: string): Promise<unknown> {
		this.log.push(['revert', config]);
		this.staged[config] = clone(this.committed[config] ?? {});
		delete this.changesList[config];
		return {};
	}

	async apply(rollback: boolean, timeout?: number): Promise<unknown> {
		this.log.push(['apply', rollback, timeout]);
		if (this.snapshot && rollback) throw new RpcError('ubus', 6, 'uci', 'apply');
		if (rollback)
			this.snapshot = {
				committed: clone(this.committed),
				staged: clone(this.staged),
				changes: clone(this.changesList),
			};
		this.committed = clone(this.staged);
		this.changesList = {};
		return {};
	}

	async confirm(): Promise<unknown> {
		this.log.push(['confirm']);
		if (!this.snapshot) throw new RpcError('ubus', 5, 'uci', 'confirm');
		this.snapshot = null;
		return {};
	}

	/** What rpcd does when the rollback timer fires. */
	fireRollback(): void {
		if (!this.snapshot) return;
		this.committed = this.snapshot.committed;
		this.staged = clone(this.snapshot.committed);
		this.changesList = {};
		this.snapshot = null;
	}
}

export function fixtureConfigs(): Configs {
	return {
		system: {
			cfg01e48a: {
				'.anonymous': true,
				'.type': 'system',
				'.name': 'cfg01e48a',
				'.index': 0,
				hostname: 'OpenWrt',
				zonename: 'UTC',
				timezone: 'GMT0',
			},
			ntp: {
				'.anonymous': false,
				'.type': 'timeserver',
				'.name': 'ntp',
				'.index': 1,
				enabled: '1',
				server: ['0.openwrt.pool.ntp.org', '1.openwrt.pool.ntp.org'],
			},
		},
		network: {
			loopback: {
				'.anonymous': false,
				'.type': 'interface',
				'.name': 'loopback',
				'.index': 0,
				device: 'lo',
				proto: 'static',
				ipaddr: '127.0.0.1',
			},
			lan: {
				'.anonymous': false,
				'.type': 'interface',
				'.name': 'lan',
				'.index': 1,
				device: 'br-lan',
				proto: 'static',
				ipaddr: ['192.168.1.1/24'],
			},
			wan: {
				'.anonymous': false,
				'.type': 'interface',
				'.name': 'wan',
				'.index': 2,
				device: 'eth1',
				proto: 'dhcp',
			},
		},
	};
}
