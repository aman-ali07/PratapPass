# KNOWN_ISSUES — PratapPass

Confirmed bugs, limitations, and unresolved questions. Everything here is **open**; closed items
move to `docs/DECISIONS.md` (as decisions) or get fixed-and-deleted with an explanation in the
handoff message. This file contains no secrets.

## Open

| ID | Type | Description | Impact | Owner / needed input |
|---|---|---|---|---|
| KI-001 | Blocked input | **Roll-number format + department prefix map pending.** Student registration (D-002) derives department from a prefix map that does not exist yet; department temporarily "Unassigned". | Blocks T-05 realistic seeding; soft-blocks department-scoped demo flows | User (sample roll numbers / faculty mapping) |
| KI-002 | Blocked input | **Supabase cloud credentials pending** (URL, anon key, service-role key). | T-02+ cannot run against a live instance; local Supabase CLI is the fallback dev target until provided | User (keys via `.env.local`, never committed) |
| KI-003 | Decision | **Email delivery provider unchosen.** MVP ships in-app notifications only; nothing in code should hard-depend on a mailer. | Email update path for decisions after T-15 | User (provider preference) |
| KI-004 | Design | **Gate-pass print/PDF template** needs institutional preference (layout, logo placement, signature blocks). Interim: modern HTML print stylesheet in T-10. | T-10 deliverable |
| KI-005 | Scope | **In-app camera-based QR scanning by security staff deferred** (D-005). URL-flow verification works from any phone camera. | Re-open only via decision entry | — |
| KI-007 | Verification | **Remaining package versions** (`@supabase/supabase-js`, `@supabase/ssr`, Zod, `qrcode`, Vitest) pin when their tasks install them — T-02/T-06/T-10/T-15; web layer already pinned at T-01 (see `TECH_STACK.md` "Installed"). | T-02 |
| KI-008 | Policy | **Retention period for medical documents undecided** (institutional policy required; `SECURITY.md` §6 requires a purge flow once decided). Interim: no auto-deletion; admin purge tool lists and deletes by audit trail. | User (institutional retention rule) |
| KI-009 | Ops | **Rate limiting / abuse controls** on public endpoints (`/verify`, submit) intentionally out of MVP; plan at pre-production review (bot-protection at Vercel/Supabase). | Pre-production |

## Resolved

| ID | Resolution (2026-10-23) |
|---|---|
| KI-006 | Typeface decided — **Poppins** (300–700) as the sole institutional typeface via `next/font`; Rubik and the "display serif" candidate dropped. Evidence + rationale: `docs/DECISIONS.md` D-012; tokens live in `app/globals.css` and verified in served CSS (T-01). |
