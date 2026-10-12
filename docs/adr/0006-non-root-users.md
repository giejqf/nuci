# ADR-0006: Non-root users

- Status: Accepted
- Date: 2026-10-12
- Phase: 9 (users and ACLs)
- Amends: D17 (root only for v1), AGENTS.md §2, §3.1, §11

## Context

0.1 supported root only (D17): the ACL file was shipped and the client
checked `session.access`, but there was no way to create other logins.
0.2 adds users with limited rights. rpcd authenticates `login` sections in
`/etc/config/rpcd`; a section's `password` is either a crypt(3) hash or
`$p$<account>`, which checks the password of a system account in
`/etc/shadow`. Its `read`/`write` lists name ACL groups.

## Findings (OpenWrt 25.12.0)

- No `mkpasswd`, `cryptpw` or `openssl` in the default image. `uhttpd -m`
  produces MD5-crypt and takes the password as a command-line argument
  (visible in the process list). busybox `passwd <user>` run as root reads
  the new password twice from stdin and stores a SHA-256 crypt hash.
- A system account with shell `/bin/false` (not in `/etc/shells`) is
  refused by dropbear: NuCI users cannot log in over SSH.
- rpcd evaluates the `login` sections at each login; changes need no
  restart and apply to new sessions.

## Decision

1. A NuCI user is a system account (`<name>:x:<uid≥1000>:65534:NuCI
   user:/var:/bin/false`) plus an rpcd `login` section with
   `password '$p$<name>'` and its ACL groups. Passwords are set through
   busybox `passwd` on stdin: never on a command line, never stored or
   returned in clear.
2. `nuci.users` (`list`, `groups`, `create`, `update`, `set_password`,
   `delete`) creates and removes account and login together, atomically
   (a failed password set removes the new account). These operations are
   **not** staged through `@nuci/uci`: half of a user (a login without its
   account, or the reverse) must never exist, and they cannot affect
   connectivity, so the rollback protocol has nothing to protect. This is
   the one deliberate exception to rule 4, limited to `rpcd` login sections.
3. `root` is listed but never modified or deleted by `nuci.users`; its
   password stays on System → Administration (`rpc-sys password_set`).
   Existing accounts are never adopted (`daemon`, ...); only accounts with
   the NuCI marker are removed.
4. Group names are validated against the installed ACL files
   (`/usr/share/rpcd/acl.d/*.json`) or `*`.
5. Roles are presets computed in the UI from the installed groups:
   administrator (`*`/`*`), operator (reads everything except backups and
   users; writes network and firewall), read-only (no backups, users or
   administration; writes nothing), or custom.
6. The `nuci-users` ACL group grants the methods; it is only part of the
   administrator role.
7. Every page hides or disables actions the session may not perform:
   uci-bound fields lock themselves (`UciView` + `canWrite`), action buttons
   check `session.acl` (`canCall`, `canFile`). The server enforces the same
   ACLs regardless.

## Consequences

- D17 now reads: root plus optional limited users.
- The e2e suite logs in as a read-only user, checks that no write control
  is enabled on any visible page, and that the router refuses its writes.
- Users are part of `/etc/passwd`/`/etc/shadow`, so backups and sysupgrade
  keep them like any other account.
