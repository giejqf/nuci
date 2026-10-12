# AGENTS.md — NuCI

NuCI is a new web frontend ecosystem for OpenWrt. It replaces LuCI; it does not
build on it, depend on it, or copy its code. This file is the contract for every
human and AI agent working in this repository: what we are building, the decisions
that are already made, how the code is laid out, how to develop and test, and the
phased plan to get to a usable 0.1.

Read this file fully before touching the repo. When you change an architectural
decision, change it here first (and add an ADR under `docs/adr/`).

---

## 1. Mission and scope

**Goal.** A fast, modern, maintainable admin UI for stock OpenWrt that covers
everything a vanilla router install needs, and a clean extension model so
`nuci-app-*` packages can add pages later.

**v1 scope (vanilla pages only):**

| Group    | Pages |
|----------|-------|
| Status   | Overview, System log, Kernel log, Processes, Realtime graphs (load, traffic, wireless, connections) |
| System   | General settings (hostname, timezone, NTP), Administration (password, SSH/dropbear, uhttpd), Software (apk), Startup (init scripts, rc.local), Backup/Flash firmware, Reboot |
| Network  | Interfaces, Devices, Wireless, DHCP & DNS (dnsmasq), Hostnames, Static routes, Diagnostics (ping/traceroute/nslookup) |
| Firewall | General, Zones, Port forwards, Traffic rules, NAT rules |

**Non-goals for v1:** nuci-app-* packages (design for them, don't ship them),
mobile-native apps, themes beyond DaisyUI built-ins, non-root multi-user UX
(ACLs are respected, but no user-management UI).

**0.2 scope** (released 0.1.0 on 2026-10-12; plan in §9 Phases 7–12):

| Area | Content |
|------|---------|
| Apps | First `nuci-app-*` packages: `wireguard`, `ddns`, `upnp`, `sqm`, built on `@nuci/app-sdk` 0.2 (configuration access through the host, ADR-0004) |
| Translations | Complete `zh-CN` and `de` catalogs for core and apps, language switcher, locale-aware number/date formatting |
| Users | Non-root rpcd users with ACL group assignment and a System → Users page (changes D17, ADR-0006) |
| 0.1 limitations | Backups and firmware beyond the `/ubus` size limits (streaming handler), more interface protocols (`6in4`, `6rd`, `dslite`; WireGuard via its app), bridge VLAN filtering (DSA `bridge-vlan`) |

**Non-goals for 0.2:** apps beyond the four above, themes beyond DaisyUI
built-ins, languages beyond `en`/`zh-CN`/`de` (the catalogs stay open to
contributions), mobile-native apps.

**Hard rule:** no LuCI runtime dependency. Not `luci-base`, not `rpcd-mod-luci`,
not the `luci` ubus object, not LuCI's JS. Reading LuCI source to learn ubus/uci
semantics is fine; copying code is not.

---

## 2. Locked decisions

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| D1 | Backend transport | **ubus JSON-RPC via `uhttpd-mod-ubus` + `rpcd`** at `/ubus` | Stock OpenWrt plumbing, no new daemon, ACL model already exists |
| D2 | Custom server logic | **ucode plugins for rpcd** (`rpcd-mod-ucode`), exposed as `nuci.*` ubus objects | Zero compile step, tiny footprint, first-class ubus/uci bindings |
| D3 | Frontend | **Vite + Svelte 5 (runes), TypeScript strict, no SvelteKit** | Static SPA, no server rendering, hash routing works under uhttpd without rewrites |
| D4 | UI kit | **Tailwind v4 + DaisyUI v5 + `@lucide/svelte`** | As requested |
| D5 | Primary target | **OpenWrt 25.12 (apk)**; 24.10 is EOL and not supported | 25.12 is current stable; apk is the package manager |
| D6 | Routing | In-house hash router (`#/network/interfaces`), lazy-loaded page chunks | Manifest-driven routing is needed for apps anyway; avoids SPA fallback config |
| D7 | Serving path | Static assets in `/www/nuci/`, served at `http://router/nuci/` | Coexists with LuCI if present; optional `/` redirect when it is not |
| D8 | Package manager (JS) | **pnpm** workspaces, Node 22 LTS | Monorepo |
| D9 | Tests | **Vitest** (unit/component), **Playwright** (e2e against QEMU), ucode tests run with host `ucode` | |
| D10 | e2e platform | **QEMU x86/64** first; `armsr/armv8` second | Fastest to boot, official images, no emulation overhead on x86 hosts |
| D11 | Session storage | ubus session token in `sessionStorage`, never in a cookie | Not sent cross-site → no CSRF surface; cleared on tab close |
| D12 | i18n | Key-based from day one (`t('network.interfaces.title')`), English is the source | Retrofitting i18n is expensive |
| D13 | License | **Apache-2.0** (SPDX header in every source file) | Permissive for nuci-app-* authors; same as LuCI |
| D14 | Hosting/CI | **GitHub + GitHub Actions**; e2e on hosted runners with TCG, self-hosted KVM runner optional later | |
| D15 | Theme | **Stock DaisyUI** `light`/`dark`, follows system preference, user override persisted in `localStorage`; no custom palette in v1 | |
| D16 | `/` takeover | **Yes.** `nuci-base` installs `/www/index.html` redirecting to `/nuci/` when no LuCI is detected, guarded by `uci nuci.main.root_redirect` (default `1`) | |
| D17 | Users | **Root plus optional limited users** (amended by ADR-0006 for 0.2): System → Users manages NuCI logins (system account without shell + rpcd login with ACL groups) through `nuci.users`; root is never modified there. 0.1 was root only | |
| D18 | Realtime transport | **Server-Sent Events** from a ucode handler at `/nuci/events` (`uhttpd-mod-ucode`), with automatic fallback to ubus polling when `EventSource` fails | Live graphs/logs without per-request overhead; polling stays as the safety net. Viability confirmed by ADR-0001 (bounded streams) |
| D19 | Target packages (25.12) | `uhttpd-mod-ubus`, `uhttpd-mod-ucode`, `rpcd-mod-ucode`, `rpcd-mod-file`, `rpcd-mod-iwinfo`, `rpcd-mod-rpcsys`, `ucode-mod-{fs,ubus,uci}`, pinned in `tools/qemu/packages.txt` | Verified on 25.12.0 in Phase 0. The stock release image ships LuCI; the lab removes it after installing these |

Open questions are listed in §11; everything above is settled unless an ADR
changes it.

---

## 3. Architecture

### 3.1 Runtime topology (on the router)

```
Browser (NuCI SPA)
   │  GET /nuci/*             static files (hashed assets, index.html)
   │  POST /ubus              JSON-RPC 2.0, session token in params
   │  GET /nuci/events?sid=…  text/event-stream (SSE) for realtime data
   ▼
uhttpd ─┬─mod-ubus──▶  ubus  ──▶  rpcd  ──▶  stock objects:  uci, session, system,
        │                          │                           file, rc, iwinfo,
        │                          │                           network.*, log, dhcp
        │                          └──rpcd-mod-ucode──▶  nuci.* objects
        │                                                 (/usr/share/rpcd/ucode/nuci-*.uc)
        └─mod-ucode──▶  /usr/share/nuci/events.uc   SSE handler: validates sid via
                     │                              session.access, then streams
                     │                              stats/log events every N seconds
                     ├─▶ /usr/share/nuci/probe.uc   apply probe (ADR-0002)
                     └─▶ /usr/share/nuci/transfer.uc streaming backup/restore/firmware
                                                    transfers past the /ubus limits (ADR-0005)
ACLs: /usr/share/rpcd/acl.d/nuci-*.json
```

**SSE handler (D18, ADR-0001).** `events.uc` runs under `uhttpd-mod-ucode`, authenticates
the `sid` query parameter with `session.access` (scope `nuci-events`, object =
stream name), subscribes the client to named streams (`stats`, `syslog`,
`kernlog`, `conntrack`, `wifi`) and writes `event:`/`data:` frames on a timer,
reusing the same collectors as `nuci.status`. Pinned in Phase 0 (ADR-0001):
uhttpd compiles handlers in **template mode** (wrap the code in `{% %}`);
`script_timeout` is global and absolute (SIGKILL), so instead of raising it
every stream ends itself before `script_timeout - 5` s (or
`nuci.main.sse_lifetime`) with an `end` event and the client reconnects; each
stream holds one `max_requests` slot, so `nuci-base` raises `max_requests` to 6
and the client keeps one EventSource per visible tab; uhttpd kills the handler
when the client disconnects, so it never pins a worker.

**Stock ubus objects we rely on** (verify method lists on the target with
`ubus -v list`):

- `session` — `login`, `access`, `destroy`, `list`
- `uci` — `get`, `set`, `add`, `delete`, `rename`, `order`, `changes`, `revert`, `commit`, `apply` (with `rollback`), `confirm`, `rollback`, `configs`
- `system` — `board`, `info`, `reboot`, `validate_firmware_image`, `sysupgrade`
- `file` — `read`, `write`, `list`, `stat`, `remove`, `exec` (ACL-restricted by path)
- `rc` — `list`, `init`
- `network.interface`, `network.device` — `dump`/`status`; `network.interface.<name>` `up`/`down`/`renew`
- `network.wireless` — netifd rejects the `ubus_rpc_session` argument uhttpd
  adds to every call (INVALID_ARGUMENT), so the browser reads radio status
  through `nuci.wifi status`
- `iwinfo` — `info`, `scan`, `assoclist`, `freqlist`, `countrylist` (needs `rpcd-mod-iwinfo`)
- `log` — `read` (logd)
- `dhcp` — `ipv6leases` (odhcpd; 25.12 ships `odhcpd-ipv6only`, IPv4 leases
  come from dnsmasq's lease file via `nuci.dhcp`)
- `network.wireless` is absent on devices without radios; treat "not found"
  as "no wireless".
- `network` — `get_proto_handlers` lists the installed netifd protocols with
  their option schemas; the UI offers only those (Phase 8). New handlers are
  loaded when netifd starts.

**`nuci.*` ucode objects** fill the gaps LuCI covers with `rpcd-mod-luci`:

| Object | Methods | Backing |
|--------|---------|---------|
| `nuci.status` | `realtime` (load, mem, per-iface rx/tx counters, conntrack count), `processes`, `kernel_log` (`after` cursor), `conntrack`, `conntrack_summary`, `signal` | `/proc`, `dmesg`, `/proc/net/nf_conntrack`, `kill` |
| `nuci.system` | `timezones`, `localtime`, `set_localtime`, `leds`, `block_devices`, `mount_points`, `usb_devices`, `backup_create`, `backup_status`, `backup_restore` | bundled zone table (`tools/gen-zoneinfo.mjs`; 25.12 has no `/usr/share/zoneinfo`), `/sys`, `block info` when block-mount is installed, `df` |
| `nuci.dhcp` | `leases` (merged dnsmasq `/tmp/dhcp.leases` + odhcpd), `hosts` | files + ubus |
| `nuci.pkg` | `list_installed`, `list_available`, `search`, `update`, `add`, `del`, `info`, `job_status` | `apk query --format json`; changes run as detached jobs (`run-job`) with a status dir |
| `nuci.diag` | `ping`, `traceroute`, `nslookup` (bounded args), `status` (output, polled) | busybox tools as a detached job |
| `nuci.wifi` | `status` (netifd radio status), `assoc_list_enriched` (iwinfo + hostnames), `scan` wrapper (AP-only radios: `iw … scan ap-force`; idle radios: temporary managed interface) | `iwinfo` via deferred calls, `iw`, `nuci.dhcp` |
| `nuci.apps` | `list` (installed nuci-app manifests) | `/usr/share/nuci/apps/*.json` |
| `nuci.users` | `list`, `groups`, `create`, `update`, `set_password`, `delete` (ADR-0006) | `/etc/passwd`, `/etc/shadow`, busybox `passwd` via stdin, uci `rpcd` |

First-party apps ship their own objects (plugin + lib + ACL inside
`apps/nuci-app-<id>/rpcd/`, typed wrappers in the app's `src/api.ts`):

| Object (app) | Methods | Backing |
|--------|---------|---------|
| `nuci.wireguard` (wireguard) | `status` (no private keys; preshared keys as a flag), `genkey`, `genpsk`, `pubkey` | `wg show all dump`, `wg genkey/genpsk/pubkey` (key on stdin) |
| `nuci.ddns` (ddns) | `providers`, `status`, `log`, `update` (job: `/etc/init.d/ddns restart`), `update_status` | `/usr/share/ddns/{default,custom}`, `/var/run/ddns`, `/var/log/ddns` |
| `nuci.upnp` (upnp) | `status` (procd state, active mappings) | `service list`, miniupnpd lease file |
| `nuci.sqm` (sqm) | `status` (root qdiscs egress/ingress) | `tc -s qdisc` on the device and `ifb4<dev>` |

Findings that shape the apps (25.12.0): netifd loads protocol handlers
(`/lib/netifd/proto/*.sh`) only at start, so a protocol installed later is
unknown until the network service restarts (pages check
`get_proto_handlers` and say so); netifd applies WireGuard peers only when
the interface is set up, so `nuci-app-wireguard` ships a procd service whose
`network` reload trigger re-runs `ifup` for tunnels whose running peers differ
from the config; miniupnpd refuses all mappings while the WAN address is
private unless `upnpd.config.external_ip` is set.
| `nuci.firewall` | `preview` (`fw4 -q print` of the saved config), `ruleset` (`nft list ruleset`); output bounded to 512 KiB with a `truncated` flag | `fw4`, `nft` |

Rules for ucode plugins:

- One file per object: `rpcd/ucode/nuci-<name>.uc`. Keep them pure functions over
  ubus/uci/fs; no shell string interpolation of user input, ever. Use argv arrays
  with `fs.popen`/`system([...])` and validate args against an allowlist.
- Every method declares `args` with types so rpcd validates input.
- Return a `UBUS_STATUS_*` integer on error, never a free-form string.
- rpcd is single-threaded and hosts `session`, `uci`, `file`, `rc`, `iwinfo`,
  `rpc-sys` and every `nuci.*` object. A *synchronous* ubus call from a plugin
  to any of them deadlocks until the timeout and stalls all other requests:
  use `conn.defer()` and return the deferred (see `nuci-wifi.uc`). Anything
  slow (apk, sysupgrade, ping) runs as a detached job (`run-job`).

**ACLs.** `rpcd/acl.d/nuci-base.json` grants the minimum `read`/`write` sets for
the v1 pages (ubus objects/methods, uci configs, file paths). Root gets `*` from
`/etc/config/rpcd` by default; non-root users get only what the ACL lists. The
frontend asks `session.access` on login and hides what the user can't do.

### 3.2 Frontend layering

```
apps/web                      the SPA: shell, routing, pages for v1 groups
  └─ uses
packages/ui                   NuCI component library (DaisyUI-styled, uci-aware)
packages/uci                  UCI model: staged changes, diff/review, commit/apply/rollback
packages/rpc                  ubus JSON-RPC client: session, batching, typed object wrappers
packages/i18n                 message catalogs + t()
packages/app-sdk              public API for nuci-app-*: manifest schema, registerPage(), HostContext
packages/app-kit              building apps with Svelte + @nuci/ui against HostContext (ADR-0004)
apps/nuci-app-<id>            first-party apps (UI, manifest, optional rpcd plugin + ACL)
```

- `@nuci/rpc` — `call(object, method, args)`, batching of concurrent calls into
  one JSON-RPC array, auto re-login on `UBUS_STATUS_PERMISSION_DENIED` with an
  expired session, typed wrappers (`rpc.uci.get(...)`, `rpc.system.board()`),
  `list()` with ACL-aware capability detection. No Svelte imports here.
- `@nuci/uci` — the heart of the system. A client-side mirror of relevant uci
  configs, a staging layer (`set/add/delete` are local until *Save*), a change
  review view (what LuCI calls "unsaved changes"), and the apply protocol
  (ADR-0002): *Save* pushes staged edits into the session's uci delta
  (`uci.set/add/delete/...`), then `uci.apply {rollback: true, timeout: 90}`
  (which snapshots and commits that delta) → hold-off → probe until it has
  stayed good for a settle window (10 s for network/wireless/firewall/dhcp) →
  `uci.confirm`; without a confirm the router rolls back automatically. Never
  call `uci.commit` first: it would leave nothing to roll back. Svelte 5 stores
  (`$state`) wrap this for the UI.
- `@nuci/ui` — `<Page>`, `<Section>`, `<Form>` + field components
  (`<TextField>`, `<Select>`, `<Toggle>`, `<ListField>`, `<DynamicList>`),
  `<DataTable>`, `<Tabs>`, `<Modal>`, `<Toast>`, `<ApplyBar>`. Fields can bind
  directly to a uci option: `<TextField uci="network.lan.ipaddr" />`.
  Icons: `@lucide/svelte` only; no other icon packs.
- `apps/web` — shell (`<Sidebar>`, `<Topbar>`, theme switch), login, route table,
  v1 pages. Pages are thin: they compose `@nuci/ui` + `@nuci/uci` + `@nuci/rpc`.
  Each page group is a lazy chunk (`import('./pages/network/Interfaces.svelte')`).
- `@nuci/app-sdk` — the public contract for `nuci-app-*`. Defines the
  manifest (`/usr/share/nuci/apps/<id>.json`: id, title, icon, menu placement,
  entry ES module under `/www/nuci/apps/<id>/`, required ACLs),
  `registerPage()` and `HostContext`. The core loads manifests from
  `nuci.apps list` after login and mounts app pages into the router. Keep its
  surface small; semver-public since 0.1. 0.2.0 added `HostContext.uci` (the
  host's staging model), `notify` and `locale` (ADR-0004).
- `@nuci/app-kit` — how first-party apps are built: Svelte 5 + `@nuci/ui`
  bundled into the app (pages stay islands), fields bound to `host.uci`
  through `HostUciStore`, `@nuci/i18n` aliased to the host's translator,
  toasts forwarded to the host, CSS without preflight/themes, Vite config.
  Apps live in `apps/nuci-app-<id>/` and are packaged by `feed/nuci-app.mk`.

### 3.3 Cross-cutting

- **Auth:** `session.login {username, password, timeout}` → store
  `ubus_rpc_session` in `sessionStorage`. The null session
  `00000000000000000000000000000000` is used only for `session.login` and
  `system.board` pre-login. Logout = `session.destroy`.
- **Safety on network changes:** every apply of `network`/`wireless`/`firewall`/
  `dhcp` goes through the rollback protocol; the UI shows a countdown and, if
  the LAN IP changed, probes the new address (static image, since `/ubus` is
  same-origin only) and hands the session over to it for the confirm
  (ADR-0002). The probe is `/nuci/probe` (`server/probe.uc`), which checks
  that the address the connection arrived on is still assigned — a reused
  keep-alive connection survives an address change, so reachability alone
  is not evidence.
- **Realtime:** `@nuci/rpc` exposes `events.subscribe(stream, handler)`, backed
  by one `EventSource` per tab to `/nuci/events`. If the connection fails or the
  handler is not installed, the same API transparently switches to ubus polling
  (visible-tab-only, default 2s, single scheduler so requests never overlap).
  Pages never know which transport is active.
- **Theme:** stock DaisyUI `light`/`dark` via `data-theme`, system preference by
  default, user choice persisted in `localStorage`.
- **Languages (0.2):** English source catalogs (`packages/i18n/en.json`, each
  app's `src/en.json`); shipped translations in `packages/i18n/locales/` (lazy
  chunks) and `apps/*/src/locales/` (bundled into the app). The language is
  the stored choice (`nuci.locale`) or the browser's (primary-subtag match);
  switching reloads the page. Numbers, sizes, dates and durations use `Intl`
  with the active locale. `tools/check-i18n.mjs` (lint) fails on unknown
  keys and on incomplete shipped translations (missing, empty, or different
  `{placeholders}`).
- **Error handling:** every ubus status code maps to a user-visible message;
  permission denied on a page = page renders read-only with an explanation.
- **Accessibility:** DaisyUI components used with proper labels; keyboard
  navigable tables/forms; `aria-live` for apply status.
- **Bundle budget:** ≤ 120 KB gzipped for shell + login + Status overview;
  each page chunk ≤ 20 KB gzipped (tightened from 250/80 KB in ADR-0003);
  each first-party app entry ≤ 60 KB gzipped including its own Svelte
  runtime (ADR-0004). CI fails over budget.
- **Request size:** uhttpd-mod-ubus rejects `/ubus` bodies over 64 KiB
  (`UH_UBUS_MAX_POST_SIZE`), and rpcd's `file.read` refuses files ≥ 256 KiB.
  `@nuci/rpc` splits batches below the limit. Backups, restores and firmware
  go through `/nuci/transfer` (ADR-0005: named files only, session in the
  `X-Nuci-Session` header, `nuci-transfer` ACL scope); small files still use
  `file.read`/`file.write` (no cgi-io).
- **No runtime network access other than `/ubus`** (no CDNs, no fonts fetched).

---

## 4. Repository layout

```
nuci/
├── AGENTS.md                      this file
├── README.md
├── LICENSE
├── package.json                   pnpm workspace root
├── pnpm-workspace.yaml
├── apps/
│   ├── web/                       SPA → builds to dist/ → /www/nuci/
│   └── nuci-app-<id>/             first-party apps → /www/nuci/apps/<id>/
│       ├── src/
│       │   ├── main.ts
│       │   ├── App.svelte
│       │   ├── router/            hash router + route table
│       │   ├── shell/             sidebar, topbar, login
│       │   └── pages/{status,system,network,firewall}/
│       ├── index.html
│       └── vite.config.ts
├── packages/
│   ├── rpc/                       @nuci/rpc
│   ├── uci/                       @nuci/uci
│   ├── ui/                        @nuci/ui
│   ├── i18n/                      @nuci/i18n
│   ├── app-sdk/                   @nuci/app-sdk
│   └── app-kit/                   @nuci/app-kit
├── rpcd/
│   ├── ucode/                     nuci-*.uc  → /usr/share/rpcd/ucode/
│   ├── acl.d/                     nuci-*.json → /usr/share/rpcd/acl.d/
│   └── lib/                       shared ucode collectors (used by plugins and events.uc)
├── server/
│   └── events.uc                  SSE handler → /usr/share/nuci/events.uc (uhttpd-mod-ucode)
├── feed/                          OpenWrt package feed (add as `src-link nuci`)
│   ├── nuci/                      meta package: depends on everything below
│   ├── nuci-base/                 /www/nuci + uhttpd config + SSE handler + root redirect + ACLs
│   ├── rpcd-mod-nuci/             ucode plugins
│   ├── nuci-app.mk                shared rules for app packages
│   └── nuci-app-<id>/             one Makefile per first-party app
├── e2e/                           Playwright project
│   ├── playwright.config.ts
│   ├── fixtures/                  router state fixtures (uci snapshots)
│   └── tests/
├── tools/
│   ├── qemu/                      lab scripts (see §7)
│   ├── sdk/                       OpenWrt SDK build wrapper
│   └── sync.sh                    scp dist + ucode to a running router
├── docs/
│   ├── adr/                       architecture decision records
│   ├── ubus-contracts/            recorded request/response fixtures per object
│   └── app-sdk.md                 nuci-app-* authoring guide
└── .github/workflows/             ci.yml (lint, unit, build, size), e2e.yml (QEMU)
```

Package naming follows OpenWrt conventions so `feed/` works unchanged with the
buildroot, the SDK and the Image Builder. `PKG_RELEASE` must be a plain integer
(apk version rules).

---

## 5. Conventions

- **TypeScript** `strict: true`, no `any` without a comment. Public package APIs
  have explicit types; `@nuci/rpc` wrappers are generated from
  `docs/ubus-contracts/*.json` where practical.
- **Svelte 5 runes only** (`$state`, `$derived`, `$effect`, `$props`). No legacy
  stores in new code.
- **Tailwind v4**: `@import "tailwindcss"; @plugin "daisyui";` in `app.css`, via
  `@tailwindcss/vite`. Prefer DaisyUI component classes over custom CSS; custom
  CSS lives in `packages/ui` only.
- **Icons:** `import { Wifi } from '@lucide/svelte'`. Never inline SVG icons.
- **Formatting/lint:** Prettier + ESLint (`eslint-plugin-svelte`), `svelte-check`
  must pass. ucode files are checked with `ucode -c` (syntax) in CI.
- **ucode:** host checks/tests use the router's ucode revision
  (`tools/install-ucode.sh`). 25.12's ucode rejects `export function f() {}`
  without a trailing `;` — declare functions normally and end modules with an
  `export { … };` list. Shared libs live in `rpcd/lib/nuci/*.uc` →
  `/usr/share/ucode/nuci/` and are imported as `nuci.<name>`.
- **Commits:** Conventional Commits (`feat(network): ...`, `fix(rpc): ...`,
  `feed: ...`). One logical change per PR.
- **i18n:** never hard-code user-visible strings in pages; add keys to
  `packages/i18n/en.json`.
- **Docs:** any new `nuci.*` method gets a fixture in `docs/ubus-contracts/` and
  an ACL entry. Any decision that contradicts §2 gets an ADR.
- **License headers:** every `.ts`, `.svelte`, `.uc` and Makefile starts with
  `SPDX-License-Identifier: Apache-2.0`; `LICENSE` at the root is the full text.
- **Security:** validate everything server-side in ucode even if the UI already
  did. `file.exec` is allowed only for a fixed allowlist of binaries in the ACL.

---

## 6. Development workflow

Prerequisites on the Linux box: Node 22, pnpm 9+, `qemu-system-x86`, `qemu-img`,
`ucode` (for running plugin tests on the host), `rsync`/`scp`, `zstd`.

```sh
pnpm install
pnpm dev            # Vite dev server on :5173, proxies /ubus → $NUCI_ROUTER (default http://127.0.0.1:8080)
pnpm test           # vitest (unit + component) + ucode tests
pnpm build          # apps/web/dist
pnpm size           # bundle budget check
pnpm e2e            # boots QEMU lab if not running, runs Playwright
tools/sync.sh       # scp dist/ → /www/nuci, rpcd/ → /usr/share/rpcd, restarts rpcd
tools/sdk/build.sh  # builds .apk packages from feed/ with the 25.12 SDK
tools/imagebuilder/build.sh   # lab image with NuCI preinstalled (Image Builder)
NUCI_FEED_KEY=key.pem tools/release.sh   # dist/release: .apk + signed packages.adb + public key
pnpm i18n:template de         # start/refresh a translation catalog
```

Inner loop: keep a QEMU router running (§7), `pnpm dev` for the frontend, and
`tools/sync.sh --rpcd` whenever a ucode plugin changes (`/etc/init.d/rpcd restart`
on the router; no reboot needed).

---

## 7. QEMU lab (e2e targets)

Scripts live in `tools/qemu/`. All of them are idempotent and non-interactive.

- `fetch.sh [version]` — downloads
  `openwrt-<version>-x86-64-generic-squashfs-combined.img.gz` (default 25.12.0)
  from `downloads.openwrt.org`, verifies `sha256sums`, decompresses to
  `tools/qemu/images/base-<version>.img`.
- `start.sh [--version V] [--name N] [--fresh]` — boots a disposable qcow2
  overlay on top of the base image so every run starts pristine:

  ```sh
  qemu-img create -f qcow2 -F raw -b images/base-25.12.0.img run/N.qcow2
  qemu-system-x86_64 -M q35 -m 512 -display none \
    -drive file=run/N.qcow2,format=qcow2,if=virtio \
    -nic user,model=virtio-net-pci,net=192.168.1.0/24,host=192.168.1.2,dhcpstart=192.168.1.100,hostfwd=tcp:127.0.0.1:8080-192.168.1.1:80,hostfwd=tcp:127.0.0.1:2222-192.168.1.1:22 \
    -nic user,model=virtio-net-pci \
    -monitor unix:run/N.mon,server,nowait -serial file:run/N.serial.log -daemonize
  # (-nographic cannot be combined with -daemonize; the serial log replaces it)
  ```

  NIC 1 = `eth0` = OpenWrt `lan` (static 192.168.1.1) with host port forwards;
  NIC 2 = `eth1` = `wan` (DHCP from QEMU user-net) so the guest has internet for
  `apk`. The serial console is logged to a file for debugging.
- `provision.sh` — waits for SSH on :2222, sets the root password used by tests,
  runs `apk update && apk add uhttpd-mod-ubus uhttpd-mod-ucode rpcd
  rpcd-mod-ucode rpcd-mod-file rpcd-mod-iwinfo rpcd-mod-rpcsys`, pushes the
  locally built nuci packages
  (`apk add --allow-untrusted ./nuci-*.apk`), restarts `uhttpd` and `rpcd`.
  The 25.12 release image ships LuCI; provisioning removes it before
  installing NuCI. `--wireless` adds two `mac80211_hwsim` radios with
  `wpad-basic-mbedtls` and `iw`, sets band 2g / channel 6 / country `US`
  (hostapd rejects the default `00`) and reboots (wpad and netifd's ucode
  wireless only come up in the right order after a boot).
  Verify on the target that each listed package exists under that name in 25.12;
  adjust in one place (`tools/qemu/packages.txt`).
- `snapshot.sh save|restore <name>` — `savevm`/`loadvm` through the monitor
  socket for fast reset between test suites.
- `stop.sh` — graceful `system quit` via the monitor.

**CI image (Phase 6):** `tools/imagebuilder/build.sh` runs the 25.12 Image
Builder with our feed's `.apk` files dropped into its `packages/` dir:
`make image PROFILE=generic PACKAGES="nuci kmod-mac80211-hwsim wpad-basic-mbedtls iw -luci…" FILES=tools/qemu/files/`
→ `tools/qemu/images/nuci-<version>.img`, booted with
`start.sh --image …`. `provision.sh` then only sets credentials and
radios, so e2e doesn't depend on network package installs. No secrets go
into the image (rule 10).

**armsr/armv8** (Phase 6): `NUCI_TARGET=armsr/armv8` switches `fetch.sh`/
`start.sh` to `qemu-system-aarch64 -M virt` with the
`armsr-armv8-generic-squashfs-combined-efi` image and `QEMU_EFI.fd`
(`qemu-efi-aarch64`); `-cpu cortex-a57` under TCG, `-accel kvm -cpu host` on
aarch64 hosts. Run a second lab next to the x86 one with
`NUCI_LAB_NAME=arm NUCI_HTTP_PORT=8081 NUCI_SSH_PORT=2223`. Nightly CI
(`nightly.yml`) runs it on an arm64 runner.

**Release feed (Phase 6):** packages are architecture independent
(`PKGARCH:=all`), so one feed serves every target. `tools/release.sh` writes
the `.apk` files, an apk v3 index signed with the SDK's `apk mkndx --sign`
and the public key; `release.yml` publishes them on `v*` tags using the
`NUCI_FEED_KEY` repository secret.

---

## 8. Testing strategy

| Layer | Tool | hat |
|-------|------|------|
| ucode plugins | host `ucode` + small harness in `rpcd/test/` that stubs `ubus`/`fs` | arg validation, parsing of `/proc` fixtures, apk output parsing |
| `@nuci/rpc` | Vitest + mocked `fetch` against `docs/ubus-contracts/` fixtures | batching, session expiry, error mapping |
| `@nuci/uci` | Vitest | staging semantics, diff generation, apply/confirm/rollback state machine |
| `@nuci/ui` | Vitest + `@testing-library/svelte` | field ↔ uci binding, validation display |
| Pages | Playwright against QEMU | login, each v1 page renders real data, a save/apply round-trip per config group, rollback when LAN IP change is not confirmed |
| Perf | `pnpm size` + `e2e/tests/perf.spec.ts` (nightly, `NUCI_E2E_PERF=1`) | bundle budgets; login interactive ≤ 4 s and overview ≤ 6 s after login under Lighthouse's mobile throttling (4× CPU, 1.6 Mbit/s, 150 ms RTT) applied through CDP, so no second browser driver is needed |

Contract fixtures in `docs/ubus-contracts/` are recorded from a real 25.12 router
with `tools/record-ubus.sh` and are the source of truth for mocks. Refresh them
when upgrading the target release.

---

## 9. Action plan

Each phase ends with a demo on the QEMU lab and a green CI run. Don't start the
next phase's pages before the previous phase's exit criteria are met.

### Phase 0 — Bootstrap (week 1)
- Monorepo scaffold, pnpm workspaces, TS/ESLint/Prettier/svelte-check, Vitest.
- `apps/web` hello-world with Tailwind v4 + DaisyUI v5 + Lucide, dark/light theme.
- `tools/qemu/*` working end to end on x86/64 25.12; `provision.sh` installs
  rpcd deps and confirms `curl -d … /ubus` works with the null session.
- `feed/` with `nuci-base` (static files + uhttpd snippet + `/` redirect with
  the `nuci.main.root_redirect` uci option) and `rpcd-mod-nuci` (empty plugin +
  ACL) building via the SDK.
- SSE spike: a minimal `events.uc` under `uhttpd-mod-ucode` that streams a
  heartbeat for 10 minutes to a `curl -N` client without being cut by uhttpd
  timeouts and exits on disconnect. Result recorded as ADR-0001 (SSE viable, or
  polling-only with reasons).
- GitHub Actions: `ci.yml` (lint, svelte-check, unit, build, size) on every
  push/PR; `e2e.yml` boots QEMU (TCG) and checks that `/nuci/` serves
  `index.html`, `/ubus` answers, and `/nuci/events` streams.
- **Exit:** `pnpm e2e` logs in through the real `/ubus` on QEMU and receives at
  least one SSE event.

### Phase 1 — Core platform (weeks 2–4)
- `@nuci/rpc`: client, batching, session lifecycle, typed wrappers for `session`,
  `uci`, `system`, `file`, `rc`, `network.*`, `iwinfo`, `log`; `events.subscribe`
  with SSE → polling fallback.
- `@nuci/uci`: config mirror, staging, change review, commit/apply/confirm/
  rollback with countdown, "unsaved changes" indicator.
- `@nuci/ui`: shell components, form fields with uci binding, `<DataTable>`,
  `<ApplyBar>`, toasts, modals.
- `apps/web`: hash router, lazy chunks, login, ACL-aware sidebar, Status →
  Overview as the first real page (uses `system.board`, `system.info`,
  `network.interface dump`, `network.wireless status`, `nuci.dhcp leases`).
- `@nuci/app-sdk`: manifest schema + `registerPage()`; `nuci.apps list`; a
  throwaway `nuci-app-hello` used only in tests to prove the extension path.
- `nuci.status`, `nuci.dhcp`, `nuci.system` ucode objects with tests.
- **Exit:** Overview page shows live data from QEMU; a uci change to
  `system.@system[0].hostname` round-trips with apply + confirm; a deliberate
  LAN IP change without confirm rolls back.

### Phase 2 — Status (week 5)
- System log, Kernel log (live follow over the `syslog`/`kernlog` SSE streams),
  Processes (kill via `nuci.status`), Realtime graphs (load, traffic per
  interface, wireless signal/rate, connections) fed by the `stats` stream and
  drawn with lightweight SVG in `@nuci/ui/charts`.
- **Exit:** all Status pages pass Playwright on both transports (e2e runs the
  suite once with SSE and once with the handler disabled to exercise polling);
  streams pause in hidden tabs.

### Phase 3 — System (weeks 6–7)
- General (hostname, timezone via `nuci.system timezones`, NTP), Administration
  (password via `rpc-sys password_set` or `nuci.system`, dropbear, uhttpd certs),
  Software (`nuci.pkg` over apk, with background job status), Startup (`rc`
  list/init + `/etc/rc.local` editor), Backup (download/restore via
  `file.read`/`file.write` + `sysupgrade -b`), Flash firmware
  (`system.validate_firmware_image` → `system.sysupgrade`), Reboot.
- **Exit:** package install/remove and firmware validate flows pass e2e;
  sysupgrade itself is tested manually only.

### Phase 4 — Network (weeks 8–11, the largest phase)
- Interfaces (list/status, edit protocol-specific forms for static/dhcp/dhcpv6/
  pppoe/none, firewall zone assignment, DHCP server tab, advanced), Devices
  (bridges, VLANs, 802.1q), Wireless (radios, SSIDs, security, scan + join,
  associated stations), DHCP & DNS (dnsmasq general/advanced, static leases,
  active leases), Hostnames, Static routes (v4/v6), Diagnostics.
- Protocol forms are table-driven (`proto-registry.ts`) so new protos are data,
  not new pages.
- **Exit:** full Network group e2e; apply of an interface change goes through
  rollback protocol; wireless scan works on QEMU with `mac80211_hwsim`
  (`apk add kmod-mac80211-hwsim` in provision for this suite).

### Phase 5 — Firewall (weeks 12–13)
- General (fw4 defaults), Zones (with forwardings), Port forwards, Traffic
  rules, NAT rules. All via uci `firewall`; `fw4 print`/`reload` exposed through
  `nuci.firewall` for a "preview ruleset" view.
- **Exit:** Firewall e2e; a port-forward added in the UI is visible in `nft list`.

### Phase 6 — Hardening and 0.1 release (weeks 14–15)
- Image Builder-based CI image, armsr/armv8 nightly, bundle budget tightening,
  accessibility pass, i18n catalog extraction, `docs/app-sdk.md`, release
  packaging and a signed feed published from GitHub Releases.
- **Exit:** tagged `v0.1.0`, feed installable with `apk add nuci` on a stock
  25.12 x86/64 and one real device.
- **Status:** tagged 2026-10-12. Validated on QEMU x86/64 and armsr/armv8
  (signed-feed install on stock images); the real-device install is still
  open and is carried into Phase 12.

### Phase 7 — App platform 0.2
- ADR-0004: apps stay islands (own UI runtime), but configuration goes
  through the host. `HostContext.uci` exposes the host's staging model
  framework-neutrally (`load`, `isLoaded`, `get`, `getBase`, `sections`,
  `getSection`, `resolve`, `set`, `add`, `remove`, `order`, `canWrite`,
  `busy`, `subscribe`); the host's ApplyBar applies app changes with the
  rollback protocol. `@nuci/app-sdk` 0.2.0 is a minor, additive release.
- `@nuci/uci`: a reactive adapter over `HostContext.uci` for apps that bundle
  Svelte; `@nuci/ui`'s context depends on a `UciView` interface, not on
  `UciStore`, so the same field components work in core and in apps.
- App build tooling: shared Vite library config (single ES module + CSS,
  DaisyUI without themes so the host's theme applies), an OpenWrt Makefile
  template, workspace layout `apps/nuci-app-<id>/` (UI, manifest, optional
  rpcd plugin and ACL) packaged as `feed/nuci-app-<id>/`.
- Port the hello fixture to Svelte + `@nuci/ui` with a uci-bound field.
- **Exit:** the hello app edits a uci option through `@nuci/ui` fields, the
  change shows in the host's change review and applies with rollback on QEMU;
  `docs/app-sdk.md` describes the 0.2 API.

### Phase 8 — Lifting 0.1 limitations
- Streaming transfer handler (`/nuci/transfer`, `uhttpd-mod-ucode`,
  session-authenticated like `/nuci/events`): backup download of any size,
  restore and firmware upload without 45 KiB `/ubus` chunks. Verified and
  recorded in ADR-0005.
- Interface protocols `6in4`, `6rd`, `dslite` in `proto-registry.ts`, offered
  only when installed (stock `network get_proto_handlers`; no new method).
- Devices: bridge VLAN filtering editor (`bridge-vlan` sections, port
  tagging/PVID) with the rollback protocol.
- **Exit:** e2e: a backup larger than 256 KiB downloads and restores; firmware
  upload uses the stream; a `6in4` interface is created and accepted by
  netifd; a VLAN-filtered test bridge applies (and an unconfirmed change on
  `br-lan` rolls back).

### Phase 9 — Users and ACLs
- ADR-0006 amends D17: non-root users are supported. rpcd `login` sections
  with ACL groups; roles are presets of `nuci-*` groups (administrator,
  operator, read-only) plus custom selection. Passwords are hashed on the
  router by a narrow `nuci.users` method (never stored in clear, never sent
  back); root cannot be removed or demoted.
- System → Users page; every page handles read-only and hidden states for
  limited sessions; app ACL groups are offered for assignment.
- **Exit:** e2e: create a read-only user, log in as it, see only permitted
  pages with no write controls, and get permission errors server-side when
  calling write methods directly; delete the user.

### Phase 10 — First apps
- `nuci-app-wireguard` (proto `wireguard` interfaces, peers, key generation
  on the router, peer config + QR export), `nuci-app-ddns` (`ddns-scripts`),
  `nuci-app-upnp` (`miniupnpd`, active redirects), `nuci-app-sqm`
  (`sqm-scripts`). Each ships manifest, UI, ACL group, any `nuci.*` methods
  with the usual tests/fixtures, and depends on the backing OpenWrt package.
- **Exit:** e2e per app on QEMU: WireGuard tunnel between the lab router and a
  peer comes up (handshake visible); DDNS service config round-trips and its
  status is shown; a UPnP redirect requested by a client appears in the list;
  SQM on wan creates the cake qdisc (`tc qdisc`).

### Phase 11 — Translations
- Complete `zh-CN` and `de` catalogs for core and the four apps; language
  switcher (persisted like the theme); `Intl`-based formatting of numbers,
  bytes, dates and durations; `lang` attribute; CI fails on missing keys
  for shipped locales.
- **Exit:** e2e runs the shell, Status overview and one page per group in
  each language without missing-key fallbacks; size budget holds (catalogs
  are lazy chunks).

### Phase 12 — 0.2 release
- Image Builder CI image with the apps, x86/64 and armsr/armv8 runs, perf and
  accessibility checks for new pages, release notes, signed feed.
- **Exit:** tagged `v0.2.0` (pushed only with the maintainer's go-ahead),
  feed installs `nuci` and each app on stock 25.12 images; the real-device
  install from Phase 6 is done or explicitly waived by the maintainer.

---

## 10. Rules for agents working in this repo

1. **Verify on the target, not from memory.** ubus method names, ACL semantics,
   rpcd ucode plugin API and apk flags change between releases. Before writing
   code that depends on them, run it on the QEMU box (`ubus -v list`,
   `ucode -h`, `apk --help`) and record fixtures. If something in this file
   disagrees with the running 25.12 router, the router is right; fix this file.
2. **Never depend on LuCI.** Don't install `luci-*` on the lab box except in a
   separate throwaway instance for comparison. Don't import LuCI JS. Don't call
   the `luci` ubus object.
3. **Keep the layering.** Pages don't call `fetch`; `@nuci/rpc` doesn't import
   Svelte; `@nuci/ui` doesn't know page-specific uci layouts.
4. **Every uci-writing page goes through `@nuci/uci` staging + apply protocol.**
   No direct `uci.commit` from a page.
5. **Every new ucode method ships with:** `args` schema, ACL entry, a host test,
   a recorded fixture, and a typed wrapper in `@nuci/rpc` (core) or in the
   app's `src/api.ts` (first-party apps; core never imports apps).
6. **Don't widen ACLs to make a feature work.** Add a narrow `nuci.*` method
   instead of granting `file.exec` on arbitrary paths.
7. **Add an ADR** (`docs/adr/NNNN-title.md`) for any change to §2 or §3.
8. **e2e before merge** for anything touching apply/rollback, login, or network
   pages. Unit tests alone are not enough there.
9. **Size budget is a test.** If a PR breaks `pnpm size`, split the chunk or
   drop the dependency; don't raise the budget without an ADR.
10. **Sandbox and secrets:** lab root password and any signing keys live in
    `tools/qemu/.env` (gitignored); never commit them, never bake them into images
    pushed anywhere public.
11. **Leave the repo runnable.** `pnpm install && pnpm test && pnpm build` must
    pass on `main` at all times.

---

## 11. Open questions (answer and move to §2)

- None open. (Non-root users: decided in ADR-0006, D17.)

