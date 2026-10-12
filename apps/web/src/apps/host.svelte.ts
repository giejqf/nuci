// SPDX-License-Identifier: Apache-2.0
//
// Host side of @nuci/app-sdk: discovers installed apps via `nuci.apps list`,
// imports their entry modules and collects registered pages.

import { addCatalog, t } from '@nuci/i18n';
import {
	HOST_KEY,
	parseManifest,
	SDK_VERSION,
	type AppManifest,
	type HostContext,
	type HostRegistry,
	type PageDefinition,
} from '@nuci/app-sdk';
import { theme } from '@nuci/ui';
import { router } from '../router/router.svelte';
import { rpc } from '../lib/services';
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
		};
	}
}

export const appHost = new AppHost();
