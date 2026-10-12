# NuCI

A fast, modern web interface for OpenWrt 25.12. It is a new frontend, not
built on LuCI: a Svelte 5 single-page app that talks to the router through
stock `rpcd`/`ubus` and a few small ucode plugins.

> Status: pre-0.1. All v1 page groups (Status, System, Network, Firewall)
> are implemented and tested end to end on OpenWrt 25.12 (QEMU); the 0.1
> release hardening is in progress. See [AGENTS.md](AGENTS.md) for the architecture, the
> locked decisions and the plan, and [docs/adr](docs/adr) for decisions made
> along the way.

## Layout

| Path | What |
|------|------|
| `apps/web` | The SPA (Vite + Svelte 5 + Tailwind v4 + DaisyUI v5) → `/www/nuci/` |
| `packages/*` | `@nuci/rpc`, `@nuci/uci`, `@nuci/ui`, `@nuci/i18n`, `@nuci/app-sdk` |
| `rpcd/` | ucode plugins (`nuci.*` ubus objects), shared libs, ACLs, host tests |
| `server/events.uc` | Server-Sent Events handler for `uhttpd-mod-ucode` |
| `feed/` | OpenWrt package feed: `nuci`, `nuci-base`, `rpcd-mod-nuci` |
| `tools/qemu/` | QEMU lab for development and e2e |
| `e2e/` | Playwright tests against the QEMU lab |
| `docs/adr/` | Architecture decision records |

## Development

Prerequisites: Node 22+, pnpm, `qemu-system-x86`, `qemu-img`, `socat`,
`zstd`, Docker (only on non-x86_64 hosts, for the SDK and Playwright), and a
host `ucode` at the router's revision (`tools/install-ucode.sh`).

```sh
pnpm install
pnpm dev                 # Vite on :5173, proxies /ubus and /nuci/events to $NUCI_ROUTER
pnpm test                # vitest + ucode host tests
pnpm lint && pnpm check  # eslint, prettier, license headers, svelte-check, ucode -c
pnpm build && pnpm size  # build + bundle budget

tools/qemu/start.sh      # boot OpenWrt 25.12 x86/64 (downloads the image once)
tools/qemu/provision.sh  # deps, root password (tools/qemu/.env), removes LuCI
tools/sync.sh            # push the working tree to the lab router
pnpm e2e                 # boot/provision if needed, sync, run Playwright
tools/sdk/build.sh       # build .apk packages into dist/feed/
```

## Installing on a router

Until signed feeds are published (Phase 6), build the packages with
`tools/sdk/build.sh` and install them on OpenWrt 25.12:

```sh
apk add --allow-untrusted ./rpcd-mod-nuci-*.apk ./nuci-base-*.apk ./nuci-*.apk
```

Then open `http://<router>/nuci/`.

## License

Apache-2.0. See [LICENSE](LICENSE).
