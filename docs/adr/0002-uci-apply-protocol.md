# ADR-0002: uci staging and the apply/confirm/rollback protocol

- Status: Accepted
- Date: 2026-10-11
- Phase: 1 (`@nuci/uci`)
- Amends: AGENTS.md §3.2 (`@nuci/uci`) and §3.3 (safety on network changes)

## Context

AGENTS.md described the apply protocol as
`uci.commit → uci.apply {rollback: true, timeout: 90} → poll → uci.confirm`.
Reading rpcd's `uci.c` (2026.10.04~d99f703e, shipped in 25.12) shows this
sequence would disable rollback:

- `uci set/add/delete/rename/order` write to the **session's** delta directory
  (`/tmp/.uci-<sid>`-style savedir), not to `/etc/config`. `uci get` with the
  same session returns values with that delta applied.
- `uci apply` iterates the session's delta files. For every config with changes
  it snapshots `/etc/config/<config>` and the delta, then **commits** the delta
  and fires `config.change` so procd reloads the service. With
  `rollback: true` it arms a timer (`timeout` seconds, default 30).
- `uci confirm` (same session only) cancels the timer and drops the snapshots;
  without it the timer restores the snapshots and reloads again. A second
  rollback-apply while one is pending gets `PERMISSION_DENIED`; `confirm` with
  nothing pending gets `NO_DATA`.
- `uci commit` commits the delta *without* a snapshot. Calling it first leaves
  `apply` nothing to snapshot, so a broken network change could not be undone.

## Decision

1. **Local staging.** Pages edit an in-browser layer (`set/add/delete/order`
   are local until *Save*). The change review lists these local edits plus
   the session's saved-but-unapplied changes (`uci changes`).
2. **Save** pushes the local layer to the session delta with
   `uci add/set/delete/rename/order` (anonymous `add` placeholders are
   mapped to the names rpcd returns), then reloads the mirror from rpcd.
3. **Apply** = Save, then `uci apply {rollback: true, timeout}` (default 90 s,
   clamped to [30, 600]), then a hold-off (5 s) so services start reloading
   before we test them, then probe connectivity every second (anonymous
   `system.board`), and `uci confirm` on the first success. The UI shows the
   countdown in an `aria-live` region.
4. **Never `uci commit` from pages** (AGENTS rule 4 stands). `commit` remains
   in `@nuci/rpc` for completeness only.
5. **Outcomes:** `confirmed`; `rolled-back` when the deadline passes without a
   successful probe (the mirror is reloaded once the router answers again, and
   `confirm` returning `NO_DATA` also means the router already rolled back);
   `failed` for apply errors (e.g. another apply pending).
6. **LAN address changes.** When a staged change moves the address the browser
   uses, the probe also tries the new address by loading a static image
   (`/nuci/probe.gif`, allowed cross-origin, unlike `/ubus`). If only the new
   address answers, the UI offers to continue there; `confirm` must come from
   the same session, so the handoff passes the session id in the URL fragment
   of a top-level navigation (`#/apply/confirm/<sid>`), which the new origin
   stores in its `sessionStorage`, uses to confirm, and immediately strips with
   `history.replaceState`. "Apply unchecked" (`rollback: false`) remains
   available for deliberate changes.

## Addendum (Phase 2): probing must not trust reused connections

The first rollback e2e pass under SSE failed: after an unconfirmed LAN address
change the probe *never* failed, although new connections were refused from
~5 s after `apply` until the rollback at ~36 s (measured with `curl`). The
probe reused an HTTP keep-alive connection, and Linux keeps delivering to an
established socket after its local address is removed (TCP early demux).
Browsers pool connections the same way, so a reachability probe could confirm
a configuration that locks out every new client.

The probe is therefore `/nuci/probe`, a `uhttpd-mod-ucode` handler that
answers `{ ok }` = "the router-side address of *this* connection
(`SERVER_ADDR`) is still assigned" (`ip -o addr show`). It works through NAT,
port forwards and DNS names because it checks the router end of the
connection. When the handler is missing (404) the client falls back to plain
reachability (`system.board`).

A second finding from the same suite: with the default "confirm on first good
probe", an eager confirm landed 3.5 s after `apply`, *before* netifd had
reloaded (~5 s under TCG), and the lab was locked out for good. A fixed
hold-off cannot rule this out on slow devices. The client therefore confirms
only after the probe has kept succeeding for a **settle window**: 10 s when
`network`, `wireless`, `firewall` or `dhcp` changed, 2 s otherwise; any failed
probe restarts the window. e2e covers both the unconfirmed and the eager case.

A third finding, from the packaged (fresh VM) run: the eager-confirm test
confirmed a lock-out again. Under load netifd applied the new address later
than hold-off + settle window (~13 s), so every probe still passed. Timing
cannot be made safe, so the probe became deterministic for address changes:
`/nuci/probe` also checks that the connection's address is still *planned* by
the committed configuration (`address_planned`: the live interface holding the
address is static, still static, enabled, and still lists it). `uci apply`
commits before services reload, so a change that removes the browser's
address makes the probe fail immediately. The settle window stays as the
safety margin for changes the probe cannot reason about (firewall, wireless).

Amendment (0.5, `nuci-app-uhttpd`): uhttpd's own listeners are a change of the
same kind. The probe also checks `listener_planned`: an enabled `uhttpd`
section of the committed config still lists a listener (`listen_http`, or
`listen_https` on a TLS connection) for the connection's local address and
port, wildcards included. `uhttpd` joins the configs with the 10 s settle
window. A listener change that cuts the browser off therefore fails the
probe at once and is rolled back.

## Consequences

- AGENTS.md §3.2/§3.3 describe this protocol.
- The rollback e2e test changes the LAN address under QEMU (which breaks the
  host port forward), does not confirm, and expects the old address back after
  the timeout.
