# ADR-0008: NuCI palette and shell layout

- Status: Accepted (2026-10-14)
- Date: 2026-10-14
- Phase: design follow-up (the designer's dashboard redesign)
- Amends: AGENTS.md §2 D15 (theme)

## Context

D15 fixed the stock DaisyUI `light` and `dark` themes and no custom
palette for v1. The design request returned a dashboard redesign
(overview, interfaces, Wi-Fi, interface editor, login, light/dark, phone).
Its look is a restrained palette (neutral surfaces, one blue accent,
status colours only for state), flat 12 px cards, 40 px controls, a
grouped sidebar with search, a breadcrumb top bar and a bottom bar for
unsaved changes.

## Decision

- The two themes keep their names (`light`, `dark`), so `data-theme`, the
  stored preference and the apps' theme-less CSS work unchanged. Their
  colours and radii are now the NuCI palette, declared with DaisyUI's
  `daisyui/theme` plugin in `apps/web/src/app.css`. Apps stay theme-less
  and follow the host's variables (ADR-0004).
- Components keep using DaisyUI classes; global polish (flat surfaces, quiet
  table headings, tinted status badges, filled switches) lives in
  `packages/ui/src/styles.css` as before.
- Shell: collapsible sidebar groups with a settings filter (the fold state
  is a `localStorage` convenience; groups start open so every link stays
  reachable), a breadcrumb in the top bar with the signed-in user, the
  apply bar as a bottom bar, a login page with the router's name and a
  password reveal. Overview gains the internet card and headline tiles
  (`StatTile` in `@nuci/ui`).
- Not taken over (backend gaps or no-ops): speed test and latency,
  per-device traffic and signal columns, QR codes for Wi-Fi, "Advanced"
  as a separate area, VPN/QoS placeholders. The Wi-Fi and interface
  pages keep their current structure and take the new look.

## Consequences

- Contrast: both palettes were chosen for text contrast on their surfaces;
  the accessibility e2e (axe) covers every route in both themes.
- Size: no new dependency; the shell grows by a few hundred bytes gzipped
  (budgets in `pnpm size` still hold).
