# Writing a nuci-app

A `nuci-app-<id>` package adds pages to NuCI without touching the core. The
contract is `@nuci/app-sdk` (semver-public from 0.1): a manifest, an ES module
that registers pages, and rpcd ACLs for whatever the pages call.

This guide uses the test-only app in `e2e/fixtures/nuci-app-hello/` as the
running example; the e2e suite installs it and checks that it works.

## How it fits together

1. The package installs a **manifest** to `/usr/share/nuci/apps/<id>.json`
   and an **entry module** under `/www/nuci/apps/<id>/`.
2. After login, the SPA calls `nuci.apps list`, validates each manifest,
   skips apps whose ACL groups the session lacks, and `import()`s the entry.
3. The entry calls `registerPage()` for each page. The host adds the pages
   to the sidebar and the hash router (`#/<group>/<page>`).
4. When the route is opened, the host calls the page's `mount(target, host)`
   with an empty element and a `HostContext`. The page renders into it with
   any technology (plain DOM, its own Svelte, …) and returns an `unmount`
   function.

Pages are islands: an app bundles its own UI runtime and never shares the
host's component instances, so host upgrades cannot break apps through
internals. Everything an app may use from the host is on `HostContext`,
including the host's uci staging model (since 0.2, ADR-0004).

The recommended way to build an app is Svelte 5 with the NuCI component
library through `@nuci/app-kit` (next section). Plain DOM or any other
framework works too, using `registerPage()` and `HostContext` directly.

## Building with Svelte and @nuci/app-kit

```ts
// src/index.ts
// SPDX-License-Identifier: Apache-2.0
import { registerSveltePage } from '@nuci/app-kit';
import css from './app.css?inline';
import Hello from './Hello.svelte';
import en from './en.json';

registerSveltePage({
	id: 'hello',
	path: 'services/hello',
	title: 'Hello',
	component: Hello,
	css,
	messages: { en },
});
```

```svelte
<!-- src/Hello.svelte -->
<script lang="ts">
	import type { HostContext } from '@nuci/app-sdk';
	import { t } from '@nuci/i18n';
	import { Section, TextField } from '@nuci/ui';
	import { onMount } from 'svelte';

	let { host }: { host: HostContext } = $props();
	onMount(() => void host.uci.load('system'));
</script>

<Section title={t('hello.section')}>
	<TextField label={t('hello.description')} uci="system.@system[0].description" />
</Section>
```

```css
/* src/app.css */
@import '@nuci/app-kit/app.css';
@source '.';
```

```ts
// vite.config.ts
import { nuciApp } from '@nuci/app-kit/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig(nuciApp({ root: fileURLToPath(new URL('.', import.meta.url)) }));
```

What `@nuci/app-kit` does for you:

- **Configuration:** `@nuci/ui` fields (`uci="config.section.option"`),
  `<SectionList>` and friends bind to `host.uci` through a `HostUciStore`.
  Edits are staged in the host: they appear in the host's "unsaved changes"
  and the user applies them from the host's apply bar, with the rollback
  protocol. Your page never saves or applies.
- **Translations:** the build routes `@nuci/i18n` to the host, so `t()` in
  your components and in `@nuci/ui` uses the host's catalogs and active
  language. Ship your own keys (prefixed with your app id) in `messages`.
- **Toasts** from `@nuci/ui` appear in the host's toaster.
- **Styles:** your CSS is injected once; it contains only the utilities and
  DaisyUI components you use, without preflight or themes, so the host's
  light/dark theme applies.
- The host renders the page heading: compose `<Section>`s, not `<Page>`.

Budget: the built `dist/index.js` must stay ≤ 60 KB gzipped (`pnpm size`
checks first-party apps). The Svelte runtime and a few fields are about
35 KB.

## The manifest

```json
{
	"id": "hello",
	"title": "Hello",
	"icon": "Smile",
	"entry": "apps/hello/index.js",
	"version": "1.0.0",
	"menu": { "group": "services", "order": 50 },
	"acls": ["nuci-app-hello"]
}
```

| Field | Rules |
|-------|-------|
| `id` | `[a-z0-9][a-z0-9-]*`, at most 64 characters; also the package suffix |
| `title` | Shown when a page has no title of its own |
| `icon` | A Lucide icon name (optional) |
| `entry` | Path of the ES module relative to `/nuci/`, ending in `.js`, no `..` |
| `menu.group` | `status`, `system`, `network`, `firewall` or `services` (default) |
| `menu.order` | Sort key inside the group (default 100) |
| `acls` | rpcd ACL groups the session must hold (read) for the app to load |

Invalid manifests are ignored. `parseManifest()` from the SDK applies the
same rules, so you can validate yours in a unit test.

## Registering pages

```ts
// SPDX-License-Identifier: Apache-2.0
import { registerPage } from '@nuci/app-sdk';

registerPage('hello', {
	path: 'services/hello',
	title: 'Hello',
	async mount(target, host) {
		host.addMessages('en', { 'hello.greeting': 'Hello from {name}' });
		const board = await host.call<{ hostname: string }>('system', 'board');
		const p = document.createElement('p');
		p.textContent = host.t('hello.greeting', { name: board.hostname });
		target.append(p);
		return () => target.replaceChildren();
	},
});
```

`registerPage(appId, page)`:

| Field | Meaning |
|-------|---------|
| `path` | Route below `#/`; must start with the page's group, e.g. `services/hello` |
| `title` | Sidebar label and page heading (English) |
| `titles` | The title in other languages by locale, e.g. `{ de: 'Hallo' }` (0.4.0); the sidebar shows it before the page is opened |
| `group`, `order` | Override the manifest's menu placement |
| `acl` | ACL group required to show this page (default: the manifest's) |
| `mount(target, host)` | Render into `target`; may be async; may return an unmount function |

The host rejects paths outside the group and duplicate paths.

## HostContext

| Member | Use |
|--------|-----|
| `call(object, method, args?)` | ubus call with the current session (batched, re-login on expiry) |
| `subscribe(stream, handler)` | Realtime streams (`stats`, `syslog`, `kernlog`, `conntrack`, `wifi`); SSE or polling is the host's choice; returns an unsubscribe function |
| `t(key, params?)` / `addMessages(locale, messages)` | i18n; prefix your keys with your app id |
| `hasAccess(group, perm?)` | Check an ACL group before offering an action |
| `navigate(path)` | Go to a host route |
| `theme` | `'light'` or `'dark'`; style with DaisyUI classes or your own CSS |
| `sdkVersion` | The host's SDK version |
| `uci` (0.2) | The host's staging model: `load`, `isLoaded`, `get`, `getBase`, `getSection`, `sections`, `resolve`, `set`, `add`, `remove`, `order`, `canWrite`, `busy`, `subscribe` |
| `notify(kind, message)` (0.2) | Toast in the host's toaster |
| `uci.add(…, { draft: true })`, `uci.confirmDraft` (0.3) | A new section for an "add" dialog: editable, but not a change until `confirmDraft(config, section)`; `remove` discards it. `@nuci/ui`'s `SectionList` uses it; older hosts ignore the flag and stage at once |
| `locale` (0.2) | Active UI language, e.g. `en` |

Apps must never call `uci.commit`, `uci.apply` or `uci.set` through `call()`.
Edit configuration through `host.uci`: the edit is staged in the host, and
the user applies it from the host's apply bar, which runs the rollback
protocol (ADR-0002). `@nuci/ui` fields do this for you.

## Translations

Put English messages in `src/en.json` (keys prefixed with your app id) and
translations in `src/locales/<locale>.json` (e.g. `de`, `zh-CN`): the same
keys, the same `{placeholders}`. Pass them all as `messages`; the host shows
the user's language and falls back to English per key. For first-party apps
`pnpm lint` checks that shipped translations are complete.

```ts
const locales = import.meta.glob<Record<string, string>>('./locales/*.json', {
	eager: true,
	import: 'default',
});
const messages: Record<string, Record<string, string>> = { en };
for (const [path, catalog] of Object.entries(locales))
	messages[path.replace(/^.*\/(.+)\.json$/, '$1')] = catalog;
```

The messages reach the host when a page is mounted, so the sidebar cannot
use them for the page's title. With `@nuci/app-kit`, give
`registerSveltePage` a `titleKey` (e.g. `hello.nav`, with the English title
in `en.json` as well): it fills `titles` from your catalogs.

## Server side

If the app needs logic on the router, ship an rpcd ucode plugin
(`/usr/share/rpcd/ucode/nuci-app-<id>.uc`) following the rules in
AGENTS.md §3.1: one object per file, declared `args`, `UBUS_STATUS_*` codes on
error, argv arrays only, no synchronous ubus calls into rpcd-hosted objects
(use `conn.defer()`), and slow work as detached jobs.

Ship an ACL file `/usr/share/rpcd/acl.d/nuci-app-<id>.json` with the narrowest
grants the app needs, and list its group in the manifest's `acls`.

Wrap your methods in a typed module (`src/api.ts`) over `host.call()`, so
pages never deal with raw ubus replies. Files the router needs besides the
plugin (init scripts, helpers) go into `root/` in the app directory and are
installed as-is by `feed/nuci-app.mk`; see `nuci-app-wireguard` for a procd
service that reacts to network config changes.

## Packaging

An OpenWrt package Makefile for an app (architecture independent):

```make
# SPDX-License-Identifier: Apache-2.0
include $(TOPDIR)/rules.mk

PKG_NAME:=nuci-app-hello
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0

include $(INCLUDE_DIR)/package.mk

define Package/nuci-app-hello
  SECTION:=nuci
  CATEGORY:=NuCI
  TITLE:=NuCI hello app
  DEPENDS:=+nuci-base
  PKGARCH:=all
endef

define Build/Compile
endef

# dist/index.js is built beforehand (pnpm build); NUCI_SRC points at the checkout.
define Package/nuci-app-hello/install
	$(INSTALL_DIR) $(1)/usr/share/nuci/apps $(1)/www/nuci/apps/hello
	$(INSTALL_DATA) $(NUCI_SRC)/apps/nuci-app-hello/manifest.json $(1)/usr/share/nuci/apps/hello.json
	$(INSTALL_DATA) $(NUCI_SRC)/apps/nuci-app-hello/dist/index.js $(1)/www/nuci/apps/hello/index.js
endef

$(eval $(call BuildPackage,nuci-app-hello))
```

Build the entry module as a single ES module (`@nuci/app-kit/vite` does
this; see `e2e/fixtures/nuci-app-hello/` and the first-party apps in
`apps/nuci-app-*/`). `PKG_RELEASE` must be a plain
integer (apk version rules).

## Testing

- Unit-test manifest validity with `parseManifest()`.
- In the NuCI repo, `pnpm e2e` builds the hello fixture and installs it on the
  QEMU lab (`e2e/run.sh`); copy that pattern for your app's e2e tests.

## Compatibility

`@nuci/app-sdk` follows semver from 0.1: new optional fields and HostContext
members are minor releases; removals or behavior changes are major releases.
Check `host.sdkVersion` if you depend on newer members: 0.2.0 added `uci`,
`notify` and `locale`; 0.3.0 added draft sections (`uci.add` option `draft`,
`uci.confirmDraft`); 0.4.0 added the page field `titles`. An app that needs them should declare a dependency
on `nuci-base (>= 0.2.0)` in its package.
