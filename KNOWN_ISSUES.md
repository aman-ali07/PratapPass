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
| KI-007 | Verification | **Remaining package versions** — Supabase/auth layer pinned at T-02 (`@supabase/supabase-js` 2.118.0, `@supabase/ssr` 0.6.1, zod 4.6.7, CLI 2.121.0 pinned; web layer pinned at T-01). QR stack verified at T-10: `qrcode` 1.5.4 (canonical), `@types/qrcode` 1.5.6, dev-only `pngjs` 7.0.0 + `jsqr` 1.4.0 (decode evidence). Still pending: Vitest (T-15). | T-15 |
| KI-008 | Policy | **Retention period for medical documents undecided** (institutional policy required; `SECURITY.md` §6 requires a purge flow once decided). Interim: no auto-deletion; admin purge tool lists and deletes by audit trail. | User (institutional retention rule) |
| KI-009 | Ops | **Rate limiting / abuse controls** on public endpoints (`/verify`, submit) intentionally out of MVP; plan at pre-production review (bot-protection at Vercel/Supabase). | Pre-production |
| KI-010 | Environment | **Local Supabase analytics pipeline disabled** (`[analytics] enabled = false` in `supabase/config.toml`): this host's Docker logging driver is unreadable by the vector sidecar, which marked the whole stack unhealthy. Log analytics/Studio log-explorer are unused by the app. | None for app features; re-enable only on a host with a compatible logging driver | — |
| KI-011 | ~~Design~~ **Resolved (T-06, D-016)** | ~~Medical-document upload transport undecided~~ — **decided by owner**: server-mediated upload (browser → server action → service-role bucket write; browser never receives a write credential) with the PRD cap **lowered 10 MB → 4 MB** to fit Vercel's ~4.5 MB function-body ceiling (no override exists). `next.config.ts` raises Next's own 1 MB action-body limit to `4.5mb`; the cap is re-enforced by Zod (4 MiB), the bucket `file_size_limit` (0007) and the DB CHECK (0008). | None — enforced at three layers, smoke-proven | — |
| KI-013 | Scope | **Document-upload UI is driven by reason only**: the file input renders for reason=medical. If an admin later sets `requires_medical_document` for a *different* reason, the user learns the requirement only at submit time (the DB function's message passes through: "A medical document is required for this request type"). Reading the actual rule in the UI would need a student-readable definer helper (`approval_rules` are admin-only under RLS). | Low impact; revisit when admin rule tooling lands (T-12) | — |
| KI-012 | ~~Design~~ **Resolved (T-04, D-015)** | ~~QR raw-token strategy~~ — **decided**: deterministic `raw = HMAC-SHA256(qr_token_secret, pass_id)`; only the SHA-256 is stored; the QR route (T-10) re-derives the raw token server-side — no token table, no plaintext. Secret lives in `private.app_secrets` (never exposed through the API; client roles hold no grants). | None in dev. **Go-live must provision the production `qr_token_secret`** (owned by the KI-002 parity checklist) — issuance fails loudly without it | — (follow-up at go-live) |
| KI-014 | Dependency | **`npm audit` reports postcss advisories via Next 15.5.28** (GHSA-qx2v-qp2m-jg93 high + sourceMappingURL family). Pre-existing since T-01 — discovered while vetting the T-10 QR packages (not introduced by them): the vulnerable `postcss` is nested under `next/node_modules`. | Build/dev-time CSS processing on this repo's own sources; no untrusted CSS is processed at runtime. Fix path is `next@16.4.3` (breaking major) — deferred to a dedicated upgrade task rather than bolted onto a feature commit. | Revisit as explicit Next 16 upgrade (post-MVP / before go-live review) |

## Resolved

| ID | Resolution (2026-10-23) |
|---|---|
| KI-006 | Typeface decided — **Poppins** (300–700) as the sole institutional typeface via `next/font`; Rubik and the "display serif" candidate dropped. Evidence + rationale: `docs/DECISIONS.md` D-012; tokens live in `app/globals.css` and verified in served CSS (T-01). |
