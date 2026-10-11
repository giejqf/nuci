# ADR-0001: Server-Sent Events under uhttpd-mod-ucode

- Status: Accepted
- Date: 2026-10-11
- Phase: 0 (SSE spike)
- Supersedes: the "raise `script_timeout`/`network_timeout` for the handler's path"
  constraint in AGENTS.md §3.1

## Context

D18 chose SSE from a ucode handler at `/nuci/events` (`uhttpd-mod-ucode`) with
ubus polling as fallback. Phase 0 had to show the handler can stream a heartbeat
for 10 minutes to `curl -N` without being cut by uhttpd timeouts, and that it
exits on disconnect.

Target: OpenWrt 25.12.0 x86/64 under QEMU (TCG), `uhttpd` and
`uhttpd-mod-ucode` 2026.08.24~373145f7-r1, `rpcd` 2026.10.04~d99f703e-r1. The
findings below come from reading uhttpd's source at that revision and from
measurements on the lab VM.

## Findings

1. **Handlers are compiled in template mode.** uhttpd's `uc_parse_config_t` does
   not set `raw_mode`, so a plain ucode script is treated as template text and
   `handle_request` is never defined (uhttpd logs "The ucode handler declares no
   handle_request() callback" and *exits*, taking `/ubus` down with it). The
   handler body must be wrapped in `{% … %}` and define
   `global.handle_request`. CI checks it with `ucode -T -c`.
2. **One process per request.** Each request forks a uhttpd child that runs
   `handle_request(env)`; output goes through a pipe and uhttpd relays it with
   chunked encoding. `uhttpd.send()` writes to a fully buffered stdout, so every
   event is followed by `uhttpd.flush()`. Measured: events arrive at the client
   one by one at the configured interval.
3. **`script_timeout` is global and absolute.** It is a single uhttpd option
   (`-t`, default 60 s) armed when the child is created and never reset on
   output; on expiry uhttpd `SIGKILL`s the child. It is not configurable per
   path. It also bounds `/ubus` deferred calls and CGI (cgi-io) requests.
   `network_timeout` does not apply while a response is streaming.
4. **Each stream holds a `max_requests` slot.** ucode handlers are "script"
   dispatches, limited by `max_requests` (default 3). `/ubus` is not a script
   dispatch and is unaffected. Measured with 3 open streams: a 4th script
   request waited 18.6 s until a stream ended, while `/ubus system info`
   answered in 53 ms.
5. **Disconnect is handled by uhttpd.** When the client goes away uhttpd frees
   the relay and `SIGKILL`s the child. Measured: after `curl` disconnects the
   handler process is gone within the next poll (≤ 3 s); no worker is pinned.
6. **Long streams work.** With `script_timeout` temporarily set to 900, one
   stream delivered 597 heartbeats over 600 s to `curl -N -m 600` (the client
   ended it), and the handler exited on disconnect.
7. **Bounded streams work with stock settings.** With the stock 60 s timeout the
   handler ends its own stream after 55 s with a final `event: end` frame and
   `curl` exits 0; EventSource reconnects automatically (`retry: 2000`).

## Decision

SSE is **viable**; D18 stands. Operational rules:

- `events.uc` bounds every stream to
  `min(nuci.main.sse_lifetime, uhttpd.main.script_timeout - 5)` seconds (minimum
  5), sends `event: end`, and closes. The client reconnects at once (with
  `Last-Event-ID`). With stock settings that is one reconnect every 55 s.
- `nuci-base` does **not** raise `script_timeout`: it is global, and a higher
  value weakens the protection it gives CGI and `/ubus`. Admins who want fewer
  reconnects can raise it; the handler adapts.
- `nuci-base` raises `uhttpd.main.max_requests` to 6 when it is lower, so two
  open tabs plus a cgi-io upload/download don't queue.
- The client keeps one EventSource per tab and closes it while the tab is
  hidden, so background tabs hold no slot.
- The handler authenticates `sid` with `session.access` (scope `nuci-events`,
  object = stream name, function `read`) before sending any data, re-checks it
  every 10 events, and rejects the null session.
- Polling stays as the fallback when EventSource fails (D18).

## Consequences

- AGENTS.md §3.1 is updated: no per-path timeout exists; streams are bounded
  instead.
- The SSE client must treat `end` as a normal reconnect, not an error.
- Template mode is a trap for future handlers; `tools/check-ucode.sh` checks
  `server/*.uc` with `-T`.
