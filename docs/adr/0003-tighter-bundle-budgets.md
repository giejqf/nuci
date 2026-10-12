# ADR-0003: Tighter bundle budgets for 0.1

- Status: Accepted
- Date: 2026-10-12
- Phase: 6 (hardening)
- Amends: AGENTS.md §3.3 (bundle budget)

## Context

AGENTS.md set ≤ 250 KB gzip for shell + login + Status overview and ≤ 80 KB
per page chunk, and lists "bundle budget tightening" for Phase 6. With every
v1 page built, `pnpm size` reports 85 KB for the initial load (Svelte runtime,
shell, DaisyUI CSS, the rpc/uci/ui packages and English messages) and at most
6 KB for any page chunk.

## Decision

- Initial load (entry closure + login + Status overview): **≤ 120 KB** gzip.
- Each lazily loaded page chunk: **≤ 20 KB** gzip.

Both leave headroom (about 40 % and 3×) without letting a page quietly pull in
a heavy dependency: a chart or editor library would now fail CI and need its
own ADR, as rule 9 intends.

## Consequences

- `tools/size.mjs` enforces the new numbers; AGENTS.md §3.3 is updated.
- Locale catalogs are separate lazy chunks and do not count toward the
  initial budget unless a language other than English is selected.
