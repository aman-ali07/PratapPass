# DESIGN_SYSTEM — PratapPass

Status: **token layer live (T-01)** — values below are *extracted from MPGI's live site kit* (CSS
facts, not guesses) and are compiled into `app/globals.css` (`--primary: #036` shorthand,
`--accent: #f7af2f`, brand utilities verified in served CSS). Decision D-012 in
`docs/DECISIONS.md`.

## 1. Brand tokens (from the institute's Elementor site kit)

| Token | Light | Dark (derived navy-inversion) |
|---|---|---|
| `--primary` | `#003366` (kit `--e-global-color-primary`†) | `#F7AF2F` (gold primary action) |
| `--primary-foreground` | `#FFFFFF` | `#1A1A1A` |
| `--secondary` | `#EEF3FF` (site wash) | `#16233B` |
| `--secondary-foreground` | `#0D47A1` | `#C8D6E8` |
| `--muted` | `#F1F5F9` | `#16233B` |
| `--muted-foreground` | `#54595F` (kit `--e-global-color-secondary`) | `#8CA0B8` |
| `--accent` | `#F7AF2F` (kit `--e-global-color-accent`, gold) | `#11498C` |
| `--accent-foreground` | `#1F1F1F` | `#FFFFFF` |
| `--destructive` | `#D10C0C` (site error red) | `#E51B23` |
| `--background` | `#FCFCFC` (kit custom light) | `#0B1424` |
| `--foreground` | `#222222` (kit `--e-global-color-text`) | `#F1F5FB` |
| `--card` / `--popover` | `#FFFFFF` | `#101B2E` |
| `--border` / `--input` | `#D9E2EF` (blue-tinted line) | `#22334F` |
| `--ring` | `#11498C` | `#F7AF2F` |
| `--radius` | `0.375rem` | same |

† First-party kit file evidence: `wp-content/uploads/elementor/css/post-*.css` definitions.

Success/status colors: **Approved green `#39B54A`** (site value) with `#E51B23` reserved as site-red
for revoked/danger escalations. Chart ramp: `#11498C #F7AF2F #39B54A #54595F #D10C0C`.

### Signature treatments (used sparingly)
- `bg-brand-gold-gradient` — the site's `45deg #ffcc00 → #ff9800 → #ffd54f` shimmer: reserve for
  primary CTAs and brand marks on primary/navy surfaces, never body areas.
- `bg-hero-scrim` — dark navy scrim (`rgba(0,22,56,.92) → rgba(0,51,102,.65)`, bottom-up) under
  hero text over imagery (mirrors the site's `to top, rgba(0,0,0,.7)` treatment).
- Shape truth: MPG's kit uses **`border-radius: 0`** (squared) — we honor the squared look at a
  modern small radius (`0.375rem`; `--radius-*` scale derives `sm/md/lg/xl`).

## 2. Typography

| Role | Typeface | Notes |
|---|---|---|
| All UI + display | **Poppins** — weights 300/400/500/600/700 | Loaded via `next/font/google` (`variable: --font-poppins`), self-hosted at build; `--font-sans` chains it. The site's own Rubik is fully dropped (single institutional typeface, decision D-012) |

- Scale: H1 32/40 semibold · H2 24/32 · H3 20/28 · body 15/24 · caption 13/20 · tabular numerals in
  tables/timers.
- Institutional formats: `23 Oct 2026`, `02:30 PM IST`.

## 3. Status language (single source of truth)

| Application status | Badge style |
|---|---|
| `submitted` | blue outline |
| `under_review` | amber solid (`--accent` family) |
| `additional_info_required` | amber outline + "Action needed" tag for students |
| `approved` / pass `Active` | green solid `#39B54A` |
| pass `Expired` | gray | 
| `rejected` / pass `Revoked` | red solid `#D10C0C` |
| `completed` | neutral solid (teal-gray) |

One badge per row; timeline uses the same colors. (Badge components land in T-06/T-07; the color
mapping above is the contract.)

## 4. Component conventions (shadcn v4 · base-nova)

- Stack is **shadcn v4/base-nova on `@base-ui/react`** (not Radix): composition uses the **`render`**
  prop instead of Radix `asChild` — e.g. `render={<Link href="…" />}` (proven in T-01 header).
- Inventory to build: `PageHeader`, `StatCard`, `AppShell`, `ApplicationCard`, `FormBlock`,
  `FileDrop`, `DocumentPreview`, `DecisionPanel`, `ApprovalTimeline`, `QrPassCard`,
  `VerifyResultCard`, `EmptyState`, `ConfirmDialog`, `Toast` — generated additions must stay inside
  `components/ui/` + `components/app/`.
- Line 6 rule: primitives in `components/ui` are generated/updated **only via the shadcn CLI**;
  hand-edits recorded in `docs/DECISIONS.md`.

## 5. Layout & responsiveness
- Mobile-first: base (≤640) card stacks → `md` two-column forms → `lg` staff sidebar; tables
  collapse to cards below `md`; sticky headers ≥lg.
- Gate verification and pass screens: single-task, high-contrast, large type (outdoor readability).
- Touch targets ≥44px; spacing within the 4px scale.

## 6. Accessibility (hard requirements)
- WCAG 2.1 AA contrast. Gold `#F7AF2F` is a *chip/action* color — dark text on gold or gold on
  primary navy; **never** small gold text on white.
- Explicit labels or accessible names; icon-only buttons named; keyboard-operable focus rings
  (`--ring`), dialog focus trap + restore.
- Motion ≤200ms opacity/transform only; `prefers-reduced-motion` respected; no decorative
  animation (project brief).

## 7. Content rules
Institutional plain English; errors say the next action ("Upload a PDF/JPG/PNG up to 4 MB");
empty states state what belongs there and what to do next; skeletons match final layout.
