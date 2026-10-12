// SPDX-License-Identifier: Apache-2.0
//
// @nuci/app-kit — build nuci-apps with Svelte 5 and the NuCI component
// library (ADR-0004). The app bundles its own Svelte runtime and components
// (pages stay islands); configuration, translations and toasts go through
// the host, so app edits show in the host's change review and are applied
// with the rollback protocol.

import { registerPage, type HostContext, type PageDefinition } from '@nuci/app-sdk';
import { bindHost } from '@nuci/i18n/remote';
import { HostUciStore } from '@nuci/uci';
import { nuciContextMap, toasts, type NuciContext } from '@nuci/ui';
import { getContext, mount, unmount, type Component } from 'svelte';

const HOST = Symbol('nuci-app-host');
const injected = new Set<string>();

/** The HostContext inside an app component tree. */
export function getHost(): HostContext {
	const host = getContext<HostContext | undefined>(HOST);
	if (!host) throw new Error('@nuci/app-kit: getHost() outside mountApp()');
	return host;
}

export interface MountOptions {
	/** App id; scopes the injected stylesheet. */
	id: string;
	/** The app's compiled CSS (import css from './app.css?inline'). */
	css?: string;
	/** Message catalogs by locale; keys should start with the app id. */
	messages?: Record<string, Record<string, string>>;
}

function injectCss(id: string, css: string | undefined): void {
	if (!css || injected.has(id) || typeof document === 'undefined') return;
	const style = document.createElement('style');
	style.dataset.nuciApp = id;
	style.textContent = css;
	document.head.append(style);
	injected.add(id);
}

/** Mount a Svelte component as an app page; returns the unmount function. */
export function mountApp(
	component: Component<{ host: HostContext }>,
	target: HTMLElement,
	host: HostContext,
	opts: MountOptions,
): () => void {
	bindHost(host);
	toasts.forward = (kind, message) => host.notify(kind, message);
	for (const [locale, messages] of Object.entries(opts.messages ?? {}))
		host.addMessages(locale, messages);
	injectCss(opts.id, opts.css);

	const store = new HostUciStore(host.uci);
	const ctx: NuciContext = { uci: store, canWrite: (c) => host.uci.canWrite(c) };
	const context = nuciContextMap(ctx);
	context.set(HOST, host);
	const app = mount(component, { target, props: { host }, context });
	return () => {
		void unmount(app);
		store.dispose();
	};
}

export interface SveltePage extends Omit<PageDefinition, 'mount'>, MountOptions {
	component: Component<{ host: HostContext }>;
}

/** registerPage() for a Svelte component page. */
export function registerSveltePage(page: SveltePage): void {
	const { component, css, messages, id, ...def } = page;
	registerPage(id, {
		...def,
		mount: (target, host) => mountApp(component, target, host, { id, css, messages }),
	});
}
