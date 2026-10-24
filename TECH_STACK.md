# TECH_STACK — PratapPass

Status: **web layer pinned at T-01; Supabase/auth layer pinned at T-02; test runner pinned at T-15**
(install timeline rows below carry actuals from `package.json`/lockfile). No planned package
installs remain; future additions still follow the rules at the bottom of this file.

## Installed (T-01, pinned)

| Layer | Technology | Pinned | Notes |
|---|---|---|---|
| Framework | Next.js (App Router, Turbopack dev/build) | `15.5.28` | `create-next-app@15` line to match the documented `^15` target |
| React | React + React DOM | `19.1.0` | Server Components by default |
| Language | TypeScript | `5.9.3` (`strict`) | `npm run typecheck` = `tsc --noEmit` |
| Styling | Tailwind CSS | `4.3.3` + `@tailwindcss/postcss 4.3.3` | CSS-first `@theme` tokens (no config JS) |
| UI library | shadcn/ui v4 · style **base-nova** | runtime `shadcn 4.22.1` + `@base-ui/react 1.9.0` | CSS-variable components in `components/ui/`; composition via `render` prop (not Radix `asChild`) |
| Utilities | `cn 0.5.0`, `class-variance-authority 0.7.1`, `tw-animate-css 1.4.0` | as declared | generated shadcn support |
| Icons | lucide-react | `1.61.0` | shadcn v4 default |
| Fonts | Poppins via `next/font/google` (self-hosted at build) | bundled | single institutional typeface (D-012) |
| Lint | ESLint `9.39.5` + `eslint-config-next 15.5.28` (flat config) | as declared | `npm run lint` |
| Scaffold source | `create-next-app@15` (template git-repo init) | — | transplanted into repo; own git index created at T-01 close |

## Install timeline (each appended here when installed)

| Technology | Installs at | Purpose |
|---|---|---|
| `@supabase/supabase-js` ^2 + `@supabase/ssr` | T-02 → **installed, verified: 2.118.0 / 0.12.7** (ssr upgraded at T-03 for typed-client generics) | DB/Auth/Storage clients (anon server + `server-only` service-role, `Database`-typed) |
| `server-only` | T-02 → **installed: 0.0.1** | build-time guard on the service-role module |
| Supabase CLI (dev dep) | T-02 → **installed, pinned exact: 2.121.0** | local DB + migrations; cloud push at go-live (KI-002) |
| Zod ^4 | T-02 → **installed, verified: 4.6.7** | shared schemas at every boundary (env, auth forms/actions) |
| react-hook-form + `@hookform/resolvers` | T-06 → **not adopted** | forms use server actions + native inputs validated by shared Zod schemas; a client form library added no value |
| `qrcode` ^1.5 | T-10 → **installed, verified: 1.5.4** (canonical `soldair/node-qrcode`) | server-side QR generation — SVG default, PNG 512 px for downloads/decoding |
| `@types/qrcode` ^1.5 | T-10 → **installed: 1.5.6 (dev)** | TS types for the QR renderer |
| `pngjs` ^7 + `jsqr` ^1.4 | T-10 → **installed: 7.0.0 / 1.4.0 (dev-only)** (canonical `pngjs`; `cozmo/jsQR`) | evidence-only QR decode round-trip in `scripts/dev/pass-smoke.mjs` (PNG → pixels → decoded text); never imported by app code |
| Vitest | T-15 → **installed, verified: 4.1.12 (dev)** | DB-backed authorization-matrix, workflow, and QR/verify tests (`npm run test`); Testing Library is **not** installed because the suite has no component tests (D-024) |

## Deliberate exclusions

- **State library** (Redux/Zustand): server components + server actions cover data; revisit only by
  decision entry.
- **Email delivery**: provider unchosen for MVP (`KNOWN_ISSUES.md` KI-003) — never a hard dependency.
- **In-app camera QR scanning**: deferred (D-005).

## Rules for future additions

Verify package exists + is canonical before first import; record exact version + one-line rationale
here; no duplicate utilities; architectural trade-offs get a `docs/DECISIONS.md` entry.
