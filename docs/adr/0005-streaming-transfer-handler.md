# ADR-0005: Streaming transfers through /nuci/transfer

- Status: Accepted
- Date: 2026-10-12
- Phase: 8 (lifting 0.1 limitations)
- Amends: AGENTS.md §3.1 (runtime topology), §3.3 (request size)

## Context

0.1 moved files over `/ubus`: uploads as 45 KiB base64 `file.write` chunks
(uhttpd-mod-ubus rejects bodies over 64 KiB) and downloads with `file.read`,
which rpcd refuses for files of 256 KiB or more. Backups with packages'
extra files or larger configs could not be downloaded at all, and a 15 MB
firmware image took hundreds of round trips plus 33 % base64 overhead.
`cgi-io` (LuCI's helper) is not an option (hard rule: no LuCI).

## Findings (OpenWrt 25.12.0, armsr/armv8 and x86/64)

- A `uhttpd-mod-ucode` handler reads the request body with
  `uhttpd.recv(n)` and streams responses with `uhttpd.send()`. No size limit
  applies (unlike `/ubus`): a 30 MB POST body arrived byte-identical; a 20 MB
  download streamed in 2.2 s.
- `env.headers` carries the request headers (lowercased names), so the
  session can be sent as a header instead of in the URL.
- `script_timeout` (60 s, global, SIGKILL; ADR-0001) bounds a single
  transfer. On LAN this is ample for firmware sizes; very slow links can hit
  it, and the client reports the failure.
- ucode on the router has no `statvfs`; free space comes from `df -k /tmp`.

## Decision

- `server/transfer.uc` at `/nuci/transfer?name=<name>` with a fixed
  allowlist: `GET backup` streams `/tmp/nuci-backup.tar.gz` (still created
  by the `nuci.system backup_create` job), `POST restore` stores
  `/tmp/nuci-restore.tar.gz`, `POST firmware` stores `/tmp/firmware.bin`.
  Clients never pass paths.
- Auth: `X-Nuci-Session` header, checked with `session.access` in the
  `nuci-transfer` scope (object = name; `read` for GET, `write` for POST).
  The scope is granted by the `nuci-backup` ACL group, which no longer needs
  `file.read`/`file.write` on those paths.
- Uploads require `Content-Length`, must leave 4 MiB free in `/tmp`
  (tmpfs is RAM; 413 otherwise), are written to `<path>.part` and renamed
  when complete, so a cut connection never leaves a truncated file behind.
- `@nuci/rpc` exposes `transfer.download(name)` (fetch) and
  `transfer.upload(name, blob, onProgress)` (XHR, for upload progress).
- `nuci-base` registers the prefix like `/nuci/events` and `/nuci/probe`.

## Consequences

- Backups and restores of any size; firmware uploads are one request.
- `file.read`/`file.write` remain for small files (rc.local, keys).
- The 60 s `script_timeout` caps a transfer's duration; raising it globally
  would also lengthen SSE streams' lifetimes (ADR-0001), so it stays.
