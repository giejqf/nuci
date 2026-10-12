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
| D17 | Users | **Root only for v1.** ACL file is still shipped and the client still checks `session.access`, but no non-root UX work, no user management | |
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
                     └─▶ /usr/share/nuci/probe.uc   apply probe (ADR-0002)
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
- `network.interface`, `network.device`, `network.wireless` — `dump`/`status`
- `iwinfo` — `info`, `scan`, `assoclist`, `freqlist`, `countrylist` (needs `rpcd-mod-iwinfo`)
- `log` — `read` (logd)
- `dhcp` — `ipv6leases` (odhcpd; 25.12 ships `odhcpd-ipv6only`, IPv4 leases
  come from dnsmasq's lease file via `nuci.dhcp`)
- `network.wireless` is absent on devices without radios; treat "not found"
  as "no wireless".

**`nuci.*` ucode objects** fill the gaps LuCI covers with `rpcd-mod-luci`:

| Object | Methods | Backing |
|--------|---------|---------|
| `nuci.status` | `realtime` (load, mem, per-iface rx/tx counters, conntrack count), `processes`, `kernel_log`, `conntrack` | `/proc`, `dmesg`, `/proc/net/nf_conntrack` |
| `nuci.system` | `timezones`, `localtime`, `set_localtime`, `leds`, `block_devices`, `mount_points`, `usb_devices` | bundled zone table (`tools/gen-zoneinfo.mjs`; 25.12 has no `/usr/share/zoneinfo`), `/sys`, `block info` when block-mount is installed, `df` |
| `nuci.dhcp` | `leases` (merged dnsmasq `/tmp/dhcp.leases` + odhcpd), `hosts` | files + ubus |
| `nuci.pkg` | `list_installed`, `list_available`, `search`, `update`, `add`, `del`, `info`, `job_status` | `apk` CLI, long jobs run detached with a status file |
| `nuci.diag` | `ping`, `traceroute`, `nslookup` (bounded args, streamed via polling) | `fs.popen` |
| `nuci.wifi` | `assoc_list_enriched` (iwinfo + hostnames), `scan` wrapper | `iwinfo` + `nuci.dhcp` |
| `nuci.apps` | `list` (installed nuci-app manifests) | `/usr/share/nuci/apps/*.json` |

Rules for ucode plugins:

- One file per object: `rpcd/ucode/nuci-<name>.uc`. Keep them pure functions over
  ubus/uci/fs; no shell string interpolation of user input, ever. Use argv arrays
  with `fs.popen`/`system([...])` and validate args against an allowlist.
- Every method declares `args` with types so rpcd validates input.
- Return a `UBUS_STATUS_*` integer on error, never a free-form string.

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
packages/app-sdk              public API for future nuci-app-*: manifest schema, registerPage()
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
- `@nuci/app-sdk` — the only thing a future `nuci-app-*` imports. Defines the
  manifest (`/www/nuci/apps/<id>/manifest.json`: id, title, icon, menu placement,
  entry ES module, required ACLs) and `registerPage()`. The core loads manifests
  from `nuci.apps list` at boot and mounts them into the router. Build this early
  (Phase 1), keep its surface small, and treat it as semver-public from 0.1.

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
- **Error handling:** every ubus status code maps to a user-visible message;
  permission denied on a page = page renders read-only with an explanation.
- **Accessibility:** DaisyUI components used with proper labels; keyboard
  navigable tables/forms; `aria-live` for apply status.
- **Bundle budget:** ≤ 250 KB gzipped for shell + login + Status overview;
  each page chunk ≤ 80 KB gzipped. CI fails over budget.
- **Request size:** uhttpd-mod-ubus rejects `/ubus` bodies over 64 KiB
  (`UH_UBUS_MAX_POST_SIZE`), and rpcd's `file.read` refuses files ≥ 256 KiB.
  `@nuci/rpc` splits batches below the limit; uploads use 45 KiB `file.write`
  chunks (no cgi-io).
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
│   └── web/                       SPA → builds to dist/ → /www/nuci/
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
│   └── app-sdk/                   @nuci/app-sdk
├── rpcd/
│   ├── ucode/                     nuci-*.uc  → /usr/share/rpcd/ucode/
│   ├── acl.d/                     nuci-*.json → /usr/share/rpcd/acl.d/
│   └── lib/                       shared ucode collectors (used by plugins and events.uc)
├── server/
│   └── events.uc                  SSE handler → /usr/share/nuci/events.uc (uhttpd-mod-ucode)
├── feed/                          OpenWrt package feed (add as `src-link nuci`)
│   ├── nuci/                      meta package: depends on everything below
│   ├── nuci-base/                 /www/nuci + uhttpd config + SSE handler + root redirect + ACLs
│   └── rpcd-mod-nuci/             ucode plugins
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
  Verify on the target that each listed package exists under that name in 25.12;
  adjust in one place (`tools/qemu/packages.txt`).
- `snapshot.sh save|restore <name>` — `savevm`/`loadvm` through the monitor
  socket for fast reset between test suites.
- `stop.sh` — graceful `system quit` via the monitor.

**CI image (Phase 6):** use the 25.12 Image Builder for x86/64 with our feed's
`.apk` files dropped into its `packages/` dir:
`make image PROFILE=generic PACKAGES="nuci" FILES=tools/qemu/files/`. This gives
a ready image so e2e doesn't depend on network package installs.

**armsr/armv8** (Phase 6): same scripts with `qemu-system-aarch64 -M virt -cpu
cortex-a57` and the `armsr-armv8` combined image; used only in nightly CI.

---

## 8. Testing strategy

| Layer | Tool | hat |
|-------|------|------|
| ucode plugins | host `ucode` + small harness in `rpcd/test/` that stubs `ubus`/`fs` | arg validation, parsing of `/proc` fixtures, apk output parsing |
| `@nuci/rpc` | Vitest + mocked `fetch` against `docs/ubus-contracts/` fixtures | batching, session expiry, error mapping |
| `@nuci/uci` | Vitest | staging semantics, diff generation, apply/confirm/rollback state machine |
| `@nuci/ui` | Vitest + `@testing-library/svelte` | field ↔ uci binding, validation display |
| Pages | Playwright against QEMU | login, each v1 page renders real data, a save/apply round-trip per config group, rollback when LAN IP change is not confirmed |
| Perf | `pnpm size` + Lighthouse in e2e (nightly) | bundle budgets, TTI on a throttled profile |

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
   a recorded fixture, and a typed wrapper in `@nuci/rpc`.
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

- **Non-root users and user management** — deferred past 0.1 (D1); revisit
  once nuci-app-* exists and needs scoped ACLs.

