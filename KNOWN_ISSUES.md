# KNOWN_ISSUES — PratapPass

Confirmed bugs, limitations, and unresolved questions. Everything here is **open**; closed items
move to `docs/DECISIONS.md` (as decisions) or get fixed-and-deleted with an explanation in the
handoff message. This file contains no secrets.

## Open

| ID | Type | Description | Impact | Owner / needed input |
|---|---|---|---|---|
| KI-001 | Blocked input | **Roll-number format + department prefix map pending.** Student registration (D-002) derives department from a prefix map that does not exist yet; department temporarily "Unassigned". | Blocks T-05 realistic seeding; soft-blocks department-scoped demo flows | User (sample roll numbers / faculty mapping) |
| KI-002 | Blocked input | **Supabase cloud credentials pending** (URL, anon key, service-role key). Local-first strategy (D-013) is working: T-02 ran and was verified entirely against the local CLI stack. | No dev impact. Go-live (T-15) needs the cloud project **with parity settings**: email confirmations on + minimum password length 8 (mirrors local `config.toml`), then paste keys → `supabase db push` → seed → live verification | User (keys via `.env.local`, never committed) |
| KI-003 | Decision | **Email delivery provider unchosen.** MVP ships in-app notifications only; nothing in code should hard-depend on a mailer. | Email update path for decisions after T-15 | User (provider preference) |
| KI-004 | Design | **Gate-pass print/PDF template** needs institutional preference (layout, logo placement, signature blocks). Interim: modern HTML print stylesheet in T-10. | T-10 deliverable |
| KI-005 | Scope | **In-app camera-based QR scanning by security staff deferred** (D-005). URL-flow verification works from any phone camera. | Re-open only via decision entry | — |
| KI-007 | Verification | **Remaining package versions** — Supabase/auth layer pinned at T-02 (`@supabase/supabase-js` 2.118.0, `@supabase/ssr` 0.6.1, zod 4.6.7, CLI 2.121.0 pinned; web layer pinned at T-01). Still pending: `qrcode` (T-10), Vitest (T-15). | T-10 / T-15 |
| KI-008 | Policy | **Retention period for medical documents undecided** (institutional policy required; `SECURITY.md` §6 requires a purge flow once decided). Interim: no auto-deletion; admin purge tool lists and deletes by audit trail. | User (institutional retention rule) |
| KI-009 | Ops | **Rate limiting / abuse controls** on public endpoints (`/verify`, submit) intentionally out of MVP; plan at pre-production review (bot-protection at Vercel/Supabase). | Pre-production |
| KI-010 | Environment | **Local Supabase analytics pipeline disabled** (`[analytics] enabled = false` in `supabase/config.toml`): this host's Docker logging driver is unreadable by the vector sidecar, which marked the whole stack unhealthy. Log analytics/Studio log-explorer are unused by the app. | None for app features; re-enable only on a host with a compatible logging driver | — |
| KI-011 | Design | **Medical-document upload transport undecided** (audit P1): 10 MB files cannot pass through a Server Action (Next ~1 MB body limit / Vercel ~4.5 MB). Options: presigned direct-to-storage upload (`createSignedUploadUrl`) or streaming route handler. | Must be decided + designed into `API.md` before T-06 starts | Owner sign-off at T-06 planning |
| KI-012 | ~~Design~~ **Resolved (T-04, D-015)** | ~~QR raw-token strategy~~ — **decided**: deterministic `raw = HMAC-SHA256(qr_token_secret, pass_id)`; only the SHA-256 is stored; the QR route (T-10) re-derives the raw token server-side — no token table, no plaintext. Secret lives in `private.app_secrets` (never exposed through the API; client roles hold no grants). | None in dev. **Go-live must provision the production `qr_token_secret`** (owned by the KI-002 parity checklist) — issuance fails loudly without it | — (follow-up at go-live) |

## Resolved

| ID | Resolution (2026-10-23) |
|---|---|
| KI-006 | Typeface decided — **Poppins** (300–700) as the sole institutional typeface via `next/font`; Rubik and the "display serif" candidate dropped. Evidence + rationale: `docs/DECISIONS.md` D-012; tokens live in `app/globals.css` and verified in served CSS (T-01). |
