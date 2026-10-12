# ADR-0004: App pages stay islands; configuration goes through the host

- Status: Accepted
- Date: 2026-10-12
- Phase: 7 (app platform 0.2)
- Amends: AGENTS.md §3.2 (`@nuci/app-sdk`), docs/app-sdk.md

## Context

0.1 defined nuci-app pages as islands: an app ships one ES module, bundles
whatever UI runtime it wants and mounts into an element the host gives it.
The only host services were `call`, `subscribe`, i18n, ACL checks,
navigation and the theme. That kept the host free to upgrade Svelte or its
components without breaking apps.

0.2 ships real apps (WireGuard, DDNS, UPnP, SQM). They edit uci, and rule 4
requires every uci-writing page to use `@nuci/uci` staging and the apply
protocol with rollback. With only `call`, an app would either write the
session's uci delta directly (bypassing the host's change review, and racing
the host's own staging) or reimplement apply/confirm/rollback.

Sharing the host's Svelte runtime and component instances with apps (an
import map for `svelte`, `@nuci/ui`, `@nuci/uci`) would make apps small, but
Svelte's compiled output depends on runtime internals of the exact version
it was compiled against, so every host upgrade could break installed apps.

## Decision

1. **Islands stay.** Apps bundle their own Svelte runtime and the components
   they use. Nothing compiled is shared with the host.
2. **`HostContext.uci`** (SDK 0.2.0, additive): a framework-neutral view of
   the host's staging model: `load`, `isLoaded`, `get`, `getBase`,
   `getSection`, `sections`, `resolve`, `set`, `add`, `remove`, `order`,
   `canWrite`, `busy` and `subscribe(listener)`. Edits are staged in the
   host's model, show in the host's change review and are applied by the
   host's ApplyBar with the rollback protocol. Apps never commit.
3. **`HostUciStore`** in `@nuci/uci` re-creates reactivity inside the app's
   own runtime from `subscribe` notifications. `@nuci/ui`'s context now
   depends on a `UciView` interface (implemented by the host's `UciStore`
   and by `HostUciStore`), so the same field components bind to uci in core
   pages and in apps.
4. **Translations and toasts go through the host.** App builds alias
   `@nuci/i18n` to `@nuci/i18n/remote` (delegates to `host.t`, so bundled
   components follow the host's locale and no second English catalog is
   shipped); `@nuci/ui` toasts forward to `host.notify` (new in 0.2.0).
   `host.locale` exposes the active locale.
5. **`@nuci/app-kit`** packages this for app authors: `registerSveltePage`
   / `mountApp` (wires uci, i18n, toasts, CSS injection), a Vite config
   (`@nuci/app-kit/vite`: one ES module with inlined CSS) and a base
   stylesheet without preflight or DaisyUI themes, so the host's theme
   variables style the app.

## Consequences

- Each app carries its own Svelte runtime and components: the hello app is
  34 KB gzipped. Budget for apps: ≤ 60 KB gzipped per entry module, enforced
  by `pnpm size`.
- The SDK surface grows by `uci`, `notify` and `locale`; all additive, so
  `@nuci/app-sdk` is 0.2.0 and 0.1 apps keep working.
- Apps get the same uci power as the session (as `call` already allowed);
  the ACL remains the security boundary.
- Host pages render the `<h1>`; app pages compose `<Section>`s instead of
  `<Page>`.
