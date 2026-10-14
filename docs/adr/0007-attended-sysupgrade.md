# ADR-0007: Attended sysupgrade through owut

- Status: Accepted (2026-10-13, after the QEMU upgrade test and a real upgrade)
- Date: 2026-10-13
- Phase: 16 (attended sysupgrade)
- Amends: AGENTS.md §3.1 (`nuci.asu`), §3.3 (outside requests)

## Context

Upgrading OpenWrt to a newer release keeps the configuration but drops
every package that is not in the new image. The OpenWrt build service
(ASU, `sysupgrade.openwrt.org`) builds an image for the device with the
installed packages. 25.12 ships `owut` (ucode) as its client; `auc` is gone.
`attendedsysupgrade-common` holds the server URL
(`attendedsysupgrade.server.url`).

## Findings (OpenWrt 25.12.0, armsr/armv8, owut 2026.08.30)

- `owut check` / `versions` / `download` / `verify` / `install` /
  `upgrade` work against the public server from the lab (25.12.0 → 25.12.5
  offered). Output is text; `owut dump` prints the same analysis as JSON
  (device, release branches and versions, package changes, server limits).
- NuCI's packages are not in the upstream feeds: `check` reports them as
  "missing to-version" and refuses to upgrade. Removing them from the build
  (`-r`) also drops their upstream dependencies (`uhttpd-mod-ucode`,
  `rpcd-mod-ucode`, `ucode-mod-*`…), because owut lists top-level packages
  only — the upgraded router would come back without any web UI.
- sysupgrade keeps files listed in `/etc/sysupgrade.conf` and
  `/lib/upgrade/keep.d/*` (passed unquoted to `find`: directories recurse,
  globs expand). The same list feeds `sysupgrade -b` (configuration
  backups).
- `owut --pre-install SCRIPT` runs just before the final sysupgrade
  (owut starts both through rpcd's `file exec`);
  `-I SCRIPT` embeds a uci-defaults script (≤ 40 KiB, server limit) that
  runs on the first boot of the new image. `install` runs plain
  `sysupgrade <image>` (settings kept).
- With NuCI's packages removed (`-r`) and their upstream dependencies
  added (`-a`), `owut check` against the public server reports "safe to
  proceed" (lab, 25.12.0 → 25.12.5).
- apk 3 does not replace a file that exists but belongs to no package,
  even with `--force-overwrite`: it registers the package and keeps the old
  file. The build service and the stub serve JSON only; owut reaches them
  over plain `http` too.

## Decision

1. Shipped as `nuci-app-asu` (depends on `owut`), not in the core: routers
   without it never contact an outside service. The browser still talks
   only to the router (§3.3 is unchanged for the browser); the router talks
   to the configured ASU server and to `downloads.openwrt.org`, as owut
   does on the command line.
2. `nuci.asu` runs owut as detached jobs (`nuci.job`): `check` (owut
   `dump`, parsed into a summary: current and target version, package
   changes, blockers), `download` (build, download, verify), `install`
   (the pre-install hook, then sysupgrade with settings kept). `install`
   does not use `owut install`: owut starts sysupgrade through rpcd's
   `file exec`, which rpcd kills after its exec timeout (`rpcd -t`, 30 s)
   — on a slow router (QEMU under TCG) before sysupgrade has handed over
   to procd, so nothing is flashed. The job runs the same two steps
   itself. Arguments are fixed argv arrays; the only
   user inputs (target version, extra packages to add or remove) are
   validated against the versions and package names owut reported.
3. NuCI survives the upgrade on three legs:
   - its packages are removed from the build (`-r`) and their upstream
     dependencies added (`-a`, read from the installed packages' depends),
     so the new image has everything NuCI runs on;
   - a `--pre-install` hook writes `/lib/upgrade/keep.d/nuci-asu` listing
     NuCI's files just before the flash, so they are carried into the new
     system's overlay. The entry is not a package file: it never reaches
     ordinary configuration backups, and restoring an old backup cannot
     downgrade NuCI;
   - an iface hotplug hook shipped by `nuci-app-asu` (kept like the rest)
     runs `asu-reinstall` once `/etc/nuci-asu` exists (no `-I` script is
     needed): when the network is up and a feed that carries NuCI is
     configured, it
     downloads NuCI's packages (`apk fetch`), only then removes the kept
     files and installs the downloaded `.apk` files, so apk knows NuCI
     again and there is no moment without a UI. Without such a feed (NuCI
     installed from local files) the kept files stay, unregistered, and the
     hook removes itself. The pre-install hook also keeps the feed list and
     any non-OpenWrt apk keys, which sysupgrade does not keep by default.
4. What owut reports as errors (missing packages other than NuCI's,
   package build failures, downgrades) stops the flow; `--force` is not
   offered. Warnings (e.g. a default package that is not installed) are
   shown and need an explicit confirmation before the build.

## Consequences

- A failed or impossible reinstall still leaves a working NuCI from the
  kept files; the Software page then lists the NuCI packages as not
  installed.

## Verification

- e2e `upgrade.spec.ts` (own Playwright project, after every other spec,
  last transport pass only): check, build and download against
  `e2e/lib/asu-stub.ts`, real sysupgrade of the armsr lab with the image
  `tools/imagebuilder/build.sh` builds with `NUCI_IB_ASU=1`; hostname, NuCI
  and the reinstall clean-up checked after the reboot.
- Manually on the armsr lab against `sysupgrade.openwrt.org`: 25.12.0 →
  25.12.5 (kernel 6.12.71 → 6.12.94), image built by the service in 110 s,
  router back after about a minute with NuCI working from the kept files.
- Found on the way: `owut check` only *warns* about downgrades while
  `download` refuses them, so the summary treats them as errors; owut and
  the stub must see the same package names (`rpc-sys packagelist`, which
  drops the libraries' ABI suffixes).
- e2e cannot depend on the public server: the ASU flow is tested against a
  local stub of the ASU API and an Image Builder image served from the host;
  the flash itself is a real sysupgrade on the QEMU lab (cold restart,
  `tools/qemu/start.sh`).
- The stub and the parser pin owut's JSON shape; a new owut release may
  need a fixture refresh (`docs/ubus-contracts/nuci.asu.json`).
