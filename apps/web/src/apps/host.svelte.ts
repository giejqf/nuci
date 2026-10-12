// SPDX-License-Identifier: Apache-2.0
//
// Host side of @nuci/app-sdk: discovers installed apps via `nuci.apps list`,
// imports their entry modules and collects registered pages.

import { addCatalog, getLocale, t } from '@nuci/i18n';
import {
	HOST_KEY,
	parseManifest,
	SDK_VERSION,
	type AppManifest,
	type HostContext,
	type HostRegistry,
	type HostUci,
	type PageDefinition,
} from '@nuci/app-sdk';
import { theme, toasts } from '@nuci/ui';
import { router } from '../router/router.svelte';
import { rpc, uci } from '../lib/services';
import { session } from '../lib/session.svelte';

export interface AppRoute {
	app: AppManifest;
	page: PageDefinition;
}

class AppHost {
	routes = $state<AppRoute[]>([]);
	errors = $state<string[]>([]);
	#manifests = new Map<string, AppManifest>();
	#loaded = false;
	#uciListeners = new Set<() => void>();
	#hostUci: HostUci | null = null;

	install(): void {
		const registry: HostRegistry = {
			sdkVersion: SDK_VERSION,
			registerPage: (appId, page) => this.#register(appId, page),
		};
		(globalThis as Record<string, unknown>)[HOST_KEY] = registry;
	}

	#register(appId: string, page: PageDefinition): void {
		const app = this.#manifests.get(appId);
		if (!app) throw new Error(`unknown app ${appId}`);
		const group = page.group ?? app.menu?.group ?? 'services';
		if (!page.path.startsWith(`${group}/`))
			throw new Error(`${appId}: ${page.path} is outside ${group}/`);
		if (this.routes.some((r) => r.page.path === page.path))
			throw new Error(`${appId}: duplicate ${page.path}`);
		this.routes.push({ app, page: { ...page, group: group as PageDefinition['group'] } });
	}

	async load(): Promise<void> {
		if (this.#loaded) return;
		this.#loaded = true;
		let list: unknown[];
		try {
			list = await rpc.nuci.apps.list();
		} catch {
			return; // rpcd-mod-nuci missing or no access: no apps
		}
		for (const raw of list) {
			const app = parseManifest(raw);
			if (!app || this.#manifests.has(app.id)) continue;
			if (app.acls?.length && !app.acls.every((g) => session.canRead(g))) continue;
			this.#manifests.set(app.id, app);
			try {
				await import(/* @vite-ignore */ new URL(app.entry, document.baseURI).href);
			} catch (e) {
				this.errors.push(`${app.id}: ${String((e as Error)?.message ?? e)}`);
			}
		}
	}

	/**
	 * Framework-neutral view of the host's staging model (ADR-0004): apps
	 * stage edits here and the host's ApplyBar applies them with rollback.
	 */
	#uci(): HostUci {
		if (this.#hostUci) return this.#hostUci;
		const listeners = this.#uciListeners;
		const notify = () => {
			for (const l of [...listeners]) {
				try {
					l();
				} catch (e) {
					console.error(e);
				}
			}
		};
		const m = uci.model;
		m.subscribe(notify);
		// Apply phases live in the store's $state, not the model.
		$effect.root(() => {
			$effect(() => {
				void uci.apply.phase;
				notify();
			});
		});
		this.#hostUci = {
			load: (...configs) => uci.load(...configs),
			isLoaded: (c) => m.isLoaded(c),
			get: (c, s, o) => m.get(c, s, o),
			getBase: (c, s, o) => m.getBase(c, s, o),
			getSection: (c, s) => m.getSection(c, s),
			sections: (c, type) => m.sections(c, type),
			resolve: (ref) => m.resolve(ref),
			set: (c, s, o, v) => m.set(c, s, o, v),
			add: (c, type, name, values) => m.add(c, type, name, values),
			remove: (c, s) => m.remove(c, s),
			order: (c, sections) => m.order(c, sections),
			canWrite: (c) => session.canWriteUci(c),
			get busy() {
				return uci.busy;
			},
			subscribe: (l) => {
				listeners.add(l);
				return () => listeners.delete(l);
			},
		};
		return this.#hostUci;
	}

	context(): HostContext {
		return {
			sdkVersion: SDK_VERSION,
			call: (object, method, args) => rpc.client.call(object, method, args ?? {}),
			t,
			addMessages: addCatalog,
			hasAccess: (group, perm = 'read') => session.acl.hasGroup(group, perm),
			subscribe: (stream, handler) =>
				rpc.events.subscribe(stream, handler as (d: unknown) => void),
			navigate: (path) => router.navigate(path),
			get theme() {
				return theme.resolved;
			},
			notify: (kind, message) => void toasts.push(kind, message),
			get locale() {
				return getLocale();
			},
			uci: this.#uci(),
		};
	}
}

export const appHost = new AppHost();
