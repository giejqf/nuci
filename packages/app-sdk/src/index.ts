// SPDX-License-Identifier: Apache-2.0
//
// @nuci/app-sdk — the only package a nuci-app-* imports. Semver-public from
// 0.1: keep this surface small.
//
// An app ships /usr/share/nuci/apps/<id>.json (its manifest, listed by
// `nuci.apps list`) and an ES module at /www/nuci/<entry>. The host imports
// the entry after login; the module calls registerPage() for each page.
// Pages mount into a host-provided element, so an app may bundle any UI
// runtime without touching the host's.

export const SDK_VERSION = '0.4.0';

export type MenuGroup = 'status' | 'system' | 'network' | 'firewall' | 'services';

export interface AppManifest {
	/** Lowercase id: [a-z0-9][a-z0-9-]*, also the package suffix (nuci-app-<id>). */
	id: string;
	title: string;
	/** Lucide icon name, e.g. "Smile". */
	icon?: string | null;
	/** ES module path relative to /nuci/, e.g. "apps/hello/index.js". */
	entry: string;
	version?: string | null;
	menu?: { group?: MenuGroup | string; order?: number };
	/** rpcd ACL groups the app's pages need (checked against session.access). */
	acls?: string[];
}

export type UciValue = string | string[];

export interface UciSection {
	'.name': string;
	'.type': string;
	'.anonymous': boolean;
	'.index'?: number;
	[option: string]: UciValue | string | number | boolean | undefined;
}

/**
 * The host's uci staging model (since 0.2.0, ADR-0004). Edits are staged
 * locally and appear in the host's change review; the user applies them from
 * the host's apply bar with the rollback protocol. Apps never commit.
 */
export interface HostUci {
	/** Load configs into the host's mirror (no-op if already loaded). */
	load(...configs: string[]): Promise<void>;
	isLoaded(config: string): boolean;
	/** Staged value of an option. */
	get(config: string, section: string, option: string): UciValue | undefined;
	/** Value as loaded from the router, before staged edits. */
	getBase(config: string, section: string, option: string): UciValue | undefined;
	getSection(config: string, section: string): UciSection | undefined;
	sections(config: string, type?: string): UciSection[];
	/** Resolve "config.section" incl. "@type[n]" selectors. */
	resolve(ref: string): { config: string; section: string; option?: string } | undefined;
	set(config: string, section: string, option: string, value: UciValue | null | undefined): void;
	/**
	 * Stage a new section; returns its (temporary) name. With `draft` (since
	 * 0.3.0) the section can be edited but is not a change until
	 * confirmDraft(); remove() discards it. Older hosts ignore the flag.
	 */
	add(
		config: string,
		type: string,
		name?: string,
		values?: Record<string, UciValue>,
		opts?: { draft?: boolean },
	): string;
	/** Turn a draft section into a staged change (since 0.3.0; absent before). */
	confirmDraft?(config: string, section: string): void;
	remove(config: string, section: string): void;
	order(config: string, sections: string[]): void;
	/** Whether the session may write this config. */
	canWrite(config: string): boolean;
	/** True while the host applies changes (lock inputs). */
	readonly busy: boolean;
	/** Notified after every change (load, edit, apply state). Returns unsubscribe. */
	subscribe(listener: () => void): () => void;
}

/** Host services available to a mounted page. */
export interface HostContext {
	readonly sdkVersion: string;
	/** Call a ubus method with the current session. */
	call<T = unknown>(object: string, method: string, args?: Record<string, unknown>): Promise<T>;
	/** Translate a key (apps add their own keys with addMessages). */
	t(key: string, params?: Record<string, string | number>): string;
	addMessages(locale: string, messages: Record<string, string>): void;
	/** Whether the session holds an ACL group. */
	hasAccess(group: string, perm?: 'read' | 'write'): boolean;
	/** Subscribe to a realtime stream (SSE or polling, chosen by the host). */
	subscribe<T = unknown>(stream: string, handler: (data: T) => void): () => void;
	/** Navigate to a host route, e.g. "status/overview". */
	navigate(path: string): void;
	readonly theme: 'light' | 'dark';
	/** Show a toast in the host's toaster (since 0.2.0). */
	notify(kind: 'info' | 'success' | 'warning' | 'error', message: string): void;
	/** Active UI locale, e.g. "en" (since 0.2.0). */
	readonly locale: string;
	/** Configuration access through the host's staging model (since 0.2.0). */
	readonly uci: HostUci;
}

export type Unmount = () => void;

export interface PageDefinition {
	/** Route below #/, e.g. "services/hello". Must start with the menu group. */
	path: string;
	title: string;
	/** The title in other languages, by locale ("de", "zh-CN"; since 0.4.0). */
	titles?: Record<string, string>;
	icon?: string;
	group?: MenuGroup;
	order?: number;
	/** ACL group required to show the page (default: the manifest's acls). */
	acl?: string;
	mount(target: HTMLElement, host: HostContext): void | Unmount | Promise<void | Unmount>;
}

/** Implemented by the host; installed on globalThis before app entries load. */
export interface HostRegistry {
	readonly sdkVersion: string;
	registerPage(appId: string, page: PageDefinition): void;
}

export const HOST_KEY = '__nuci_host__';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PATH_RE = /^[a-z0-9-]+(\/[a-z0-9-]+)+$/;

/** Type-check a manifest at build time; returns it unchanged. */
export function defineManifest(m: AppManifest): AppManifest {
	return m;
}

/** Validate untrusted manifest JSON (the host does this too). */
export function parseManifest(input: unknown): AppManifest | null {
	if (!input || typeof input !== 'object') return null;
	const m = input as Record<string, unknown>;
	if (typeof m.id !== 'string' || !ID_RE.test(m.id)) return null;
	if (typeof m.title !== 'string' || !m.title) return null;
	if (
		typeof m.entry !== 'string' ||
		!/^[A-Za-z0-9._/-]+\.js$/.test(m.entry) ||
		m.entry.includes('..')
	)
		return null;
	const menu = (m.menu && typeof m.menu === 'object' ? m.menu : {}) as Record<string, unknown>;
	return {
		id: m.id,
		title: m.title,
		icon: typeof m.icon === 'string' ? m.icon : null,
		entry: m.entry,
		version: typeof m.version === 'string' ? m.version : null,
		menu: {
			group: typeof menu.group === 'string' ? menu.group : 'services',
			order: typeof menu.order === 'number' ? menu.order : 100,
		},
		acls: Array.isArray(m.acls) ? m.acls.filter((a): a is string => typeof a === 'string') : [],
	};
}

/**
 * Register a page. `appId` must match the manifest id; the host rejects
 * paths outside the app's menu group or duplicate paths.
 */
export function registerPage(appId: string, page: PageDefinition): void {
	const host = (globalThis as Record<string, unknown>)[HOST_KEY] as HostRegistry | undefined;
	if (!host) throw new Error('@nuci/app-sdk: not running inside the NuCI host');
	if (!ID_RE.test(appId)) throw new Error(`@nuci/app-sdk: invalid app id ${appId}`);
	if (!PATH_RE.test(page.path)) throw new Error(`@nuci/app-sdk: invalid page path ${page.path}`);
	if (typeof page.mount !== 'function')
		throw new Error('@nuci/app-sdk: page.mount must be a function');
	host.registerPage(appId, page);
}
