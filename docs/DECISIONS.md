# DECISIONS — PratapPass (ADR log)

Format: decision · date · context · decision · alternatives considered · consequences.
Statuses: **Active** / Superseded / Reversed. Append new entries; never delete history entries.

---

### D-001 — MPGI branding with modern shadcn/ui execution · **Active** · 2026-10-23
**Context** Product brief initially loosely referenced a college site; user specified MPGI
(mpgi.edu.in) *"but with modern UI/UX components and elements"*.
**Decision** Brand as Maharana Pratap Group of Institutions; palette extracted from the live site
(deep blue #0F4C97/#003366, gold #FFC107, plus semantic green/red) rebuilt as Tailwind/shadcn
tokens with clean typographic execution rather than replicating the WordPress-era layout.
**Alternatives** (a) neutral generic institutional design — rejected, user-requested similarity;
(b) Pratap University Jaipur palette — superseded by this user instruction.
**Consequences** `DESIGN_SYSTEM.md` is the binding palette; landing page mirrors university-site
information structure (notices/stats) in modern components.

### D-002 — Student registration via roll number; staff admin-provisioned · **Active** · 2026-10-23
**Context** User answered the signup-policy question: *"registration using roll number, later i
will provide you with the other detail."*
**Decision** Students self-register with roll number + email + password; department derived via a
roll-prefix map once provided (temporarily "Unassigned"); all staff roles are provisioned by
admins only — no staff self-registration path exists.
**Alternatives** fully admin-provisioned accounts for everyone (stricter, more friction),
open email-domain signup (weaker identity binding).
**Consequences** schema holds `profiles.roll_number` (unique, partial index); `KNOWN_ISSUES.md`
KI-001 tracks the pending format/map; extension fields must degrade gracefully until provided.

### D-003 — Supabase as single data plane (DB + Auth + Storage) · **Active** · 2026-10-23
Supabase satisfies project needs and brief's explicit stack clause with best RLS/flexible
migration workflow. Alternatives (standalone Postgres + separate identity/storage services) add
operational burden without benefit at this scale. Cloud project credentials pending (KI-002);
local Supabase CLI is the interim dev fallback.

### D-004 — Server Actions for mutations; route handlers only for special cases · **Active** · 2026-10-23
Forms/dashboards use Next.js Server Actions (typed, Zod-validated). Route handlers exist for QR
image serving, programmatic gate endpoints, and signed-URL redirect. Alternative of an
all-route-handler API adds indirection without benefit for form-driven flows. Contract lives in
`API.md`.

### D-005 — QR encodes the verification URL; no in-app camera scanner in MVP · **Active** · 2026-10-23
**Decision** Approved pass QR encodes `{SITE}/verify?token=…`; any phone camera resolves it;
security staff need no native app/scanner library. The raw token is stored hashed (SHA-256) on
`gate_passes` and never persisted in plaintext.
**Alternatives** (a) in-app scanner (zxing/html5-qrcode) — deferred (needs camera permissions UX;
URL-flow covers phones); (b) separate `pass_tokens` table — folded into `gate_passes` columns
(hashed token + expiry + revocation) to avoid an extra joining table for one 1:1 relation
(`DATABASE.md` §2).

### D-006 — Approval history & audit logs are append-only · **Active** · 2026-10-23
`approval_actions`, `gate_verification_logs`, `audit_logs` get **no UPDATE/DELETE policies at all**
(admins included). Inserts occur only via SECURITY DEFINER functions/triggers; app code never has
direct INSERT. Consequence: corrections require new compensating rows, never edits.

### D-007 — Emergency applications expedite directly to HOD · **Active** · 2026-10-23
Brief-driven default: `approval_rules` for `reason='emergency'` provision only a single `hod`
approval step (no faculty stage). Admin UI (T-12) remains able to re-tune chains per
department/reason thereafter.

### D-008 — `approval_rules` configuration table added beyond the brief's 10 tables · **Active** · 2026-10-23
The brief enumerated 10 tables but grants freedom to "create appropriate relational tables."
A distinct `approval_rules` table (`department/reason → chain, requires_medical_document,
pass_validity_hours`) keeps admin-configurable behavior relational rather than semi-structured
column hacks inside `departments`.

### D-009 — Roles read from `profiles` in RLS policies · **Active** · 2026-10-23
Instead of syncing a custom JWT claim on role change, RLS policies join `profiles` for role and
department checks (session only contributes `auth.uid()`). Trade-off: every policy needs the join;
gains: zero stale-claim privilege windows after role changes, simpler admin operations. Revisit
only if query-plan cost is demonstrated on fixture sizes (record in a new entry).

### D-010 — Documentation scope at setup time · **Active** · 2026-10-23
Created `AGENTS.md`, `README.md`, `PRD.md`, `ARCHITECTURE.md`, `TASKS.md`, `TECH_STACK.md`,
`DESIGN_SYSTEM.md`, `DATABASE.md`, `API.md`, `SECURITY.md`, `.env.example`, `docs/DECISIONS.md`,
`KNOWN_ISSUES.md`, `.gitignore`.
**Deliberately not created**: `TESTING.md`, `DEPLOYMENT.md`, `CHANGELOG.md` — no code/tests exist;
their doc files would restate TASKS/TECH_STACK without any factual content. They are created at
T-15/first release (TASKS §deferred), preventing invented-history documentation.

### D-011 — Documentation marked "planned", never "implemented" · **Active** · 2026-10-23
Repository was empty at setup. Every doc asserted the **documentation-foundation** status banner;
all features described as planned; "Completed work: none" stated the truth in `TASKS.md` *at that
date*. No historical claims or fabricated changelog dates are permitted — banners must be updated
as milestones complete (T-01/T-02a now), never allowed to drift stale in either direction.

### D-012 — MPGI theme tokens finalized from the live site kit · **Active** · 2026-10-23
**Context** Brief demanded "college website similarity" (MPGI); the site autopsy identified the
definitive sources: `.elementor/css/post-*.css` kit definitions (`--e-global-color-primary: #003366`,
`--e-global-color-accent: #F7AF2F`, `--e-global-color-text: #222222`,
`--e-global-color-secondary: #54595F`, custom `#FCFCFC`), Poppins (300–900) as the primary-loaded
Google font, `45deg #ffcc00→#ff9800→#ffd54f` gold signature, and `border-radius: 0` shape language.
**Decision** PratapPass tokens = those kit values compiled into `app/globals.css` (light theme);
dark mode derived by navy-inversion; **Poppins becomes the sole typeface** (Rubik dropped);
modernization keeps a small radius `0.375rem` and shadcn **v4/base-nova** (via `@base-ui/react`,
`render` prop instead of `asChild`); gold gradient reserved for CTA/hero only.
**Alternatives** display serif for hero headings (KI-006 candidate) — closed: contradicts the
institution's real typography. Full kit-fidelity squared corners at radius 0 — rejected for
modern-component ergonomics (e.g. focus-ring legibility).
**Consequences** Closes KI-006; `DESIGN_SYSTEM.md` §1 is the binding palette. Site autopsy
(WP 6.8/LiteSpeed/Elementor) exists purely as reference — PratapPass remains Next.js + Supabase.

### D-013 — Local-first dual-target database (CLI stack now, cloud keys later) · **Active** · 2026-10-23
**Context** Development began before the Supabase cloud project exists; the user supplies
credentials only at the end ("at last I will put the supabase credentials" — tracked as KI-002).
**Decision** `supabase/migrations/*` is the single source of truth. Dev runs against the local CLI
stack (`./node_modules/.bin/supabase`, pinned devDependency 2.121.0); `.env.local` is generated
from `supabase status -o env` for local. At go-live the SAME migrations are pushed to the cloud
project (`supabase db push`) and `.env.local` is swapped to the cloud keys — no code changes
expected (all clients are env-driven).
**Alternatives** Blocking all progress until keys arrive — rejected; maintaining a divergent dev
schema — rejected at this scale (the migration set is shared, so drift is impossible by
construction).
**Consequences** Local conveniences differ from cloud defaults: demo local keys, email
confirmations off — the register flow already handles the cloud's no-session
`needs-email-confirmation` path. Local `[analytics]` is disabled on this host (vector sidecar
cannot read the Docker logging driver; KI-010) — no feature impact.

### D-014 — Profile self-edit scope = row policy + column GRANTs · **Active** · 2026-10-23
**Context** The 4-agent post-T-02 audit found the 0001 self-update policy allowed rewriting
`role`/`department_id` — a one-call admin escalation. PostgreSQL has **no column lists in
`CREATE POLICY`**, and Supabase default privileges grant EXECUTE explicitly to
anon/authenticated/service_role (a PUBLIC-only REVOKE is a no-op) — both traps shape the fix.
**Decision** Scope comes from two layers: table-level RLS policy pins the row (`id = auth.uid()`)
and column-level GRANTs pin the write surface (UPDATE on `full_name`/`phone` only; anon keeps
nothing). Helper execution: `get_user_role`/`is_admin` revoked from anon (by name, not just
PUBLIC). Roll uniqueness is case-insensitive via expression index `lower(roll_number)`.
**Consequences** Admin provisioning paths keep full write via service_role/definer functions.
Future column-scoped edits must follow the same policy+grant pattern (documented in
`DATABASE.md` §2).

### D-015 — QR token = deterministic HMAC; issuance via trigger · **Active** · 2026-10-23
**Context** Closes KI-012 before T-04's `fn_issue_pass` bakes the token format in: a random raw
token could never be re-rendered for a second QR fetch/print, and a token *table* contradicts
the single-plane design. Gate log rows must reference a pass (unknown probes cannot be logged).
**Decision** `raw = HMAC-SHA256(qr_token_secret, gate_passes.id)` (hex); only `SHA-256(raw)` is
stored. Determinism lets the T-10 QR route re-derive the raw token from the pass id — no token
storage, no plaintext, revocation still rebinds via `revoked_at`. Secret lives in
`private.app_secrets` (non-API schema, all client roles revoked) — single DB-side source of truth
read by `fn_issue_pass`; the QR route re-derives the raw token through `fn_pass_qr_token` (0010,
D-017) — the originally planned service-role-client read proved impossible because `private` is
not PostgREST-exposed. Pass issuance is
a 0006 trigger on the application's transition to `approved` (the decide function only decides).
**Consequences** Rotation invalidates previously issued QRs but pass codes (`MPGI-*`) stay valid —
guards can fall back to code entry. Go-live must provision the production secret (KI-002);
issuance fails loudly (never silently) without it. Edge semantics (late returns accepted, unknown
probes unlogged) are specified in `DATABASE.md` §6 addendum.

### D-016 — Medical-document upload: server-mediated, cap 4 MB · **Active** · 2026-10-23
**Context** Resolves KI-011 before building T-06: a 10 MB document cannot traverse a Server
Action (Next's own 1 MB default limit / Vercel's hard ~4.5 MB function-body ceiling, which has no
override — confirmed against current Vercel docs). Direct-to-storage alternatives (presigned
`createSignedUploadUrl` or a streaming route handler) were weighed against keeping the validated
server action as the single boundary. The owner explicitly chose: keep the server-mediated
transport faithful to `SECURITY.md`/`DATABASE.md §4`, and lower the product cap to 4 MB.
**Decision** The browser submits fields + file in one server-action call and never receives a
bucket write credential. The action: Zods the fields and the file claim; **sniffs magic bytes and
rejects on any declared/sniffed mismatch** (renamed-binary defense); generates the application
UUID server-side and uploads directly to the FINAL `{application_id}/{uuid}.{ext}` path via the
service-role client (0008 lets `fn_submit_application` accept that id — no staging prefix, no
post-commit move); calls `fn_submit_application` under the real session; on function failure it
removes the uploaded object (no orphans). The 4 MiB cap is enforced at three layers: Zod
(`lib/validation/application.ts`), the bucket `file_size_limit` (0007), and the DB CHECK (0008);
`next.config.ts` raises Next's action-body limit to 4.5 MB so a legal payload always clears.
**Consequences** The product accepts a smaller document ceiling as the explicit trade-off for a
uniform validated boundary. Times arrive as UTC ISO converted in the browser (naive strings would
be parsed in the server's timezone — client component mirrors `datetime-local` → hidden ISO
input). The UI shows the file input for reason=medical only; rule-driven requirements for other
reasons surface the DB function's message at submit (KI-013).

### D-017 — Raw QR token via a guarded SECURITY DEFINER function, not a PostgREST-exposed secret · **Active** · 2026-10-24
**Context** D-015 specified deterministic raw tokens and a QR route that re-derives them. At T-10 it
became concrete that `supabase/config.toml` exposes only `public`/`graphql_public` — `private.app_secrets`
is deliberately outside the API surface. The Node route therefore *cannot* read the secret, and
exposing the schema to PostgREST would widen the secret's reachability for every API role.
**Decision** Migration `0010` adds `fn_pass_qr_token(p_pass_id)` (SECURITY DEFINER,
authenticated-only grant): re-derives `raw = hmac(data=secret, key=pass_id)` with the SAME
pgcrypto argument order as `fn_issue_pass`, returns it ONLY to the pass's owning student or an
admin, and verifies `SHA-256(raw) = token_hash` — failing loudly on secret rotation. The route
calls it under the caller's session, so the function's owner/admin guards run as a second layer
beneath the route's explicit scope re-check (route = boundary, DB = authority).
**Consequences** The secret never leaves the database; the raw credential is minted only inside
the DB, per request. Rotation invalidates outstanding QRs loudly (D-015 consequence stays valid).
The QR route serves SVG by default and PNG via `?format=png` (raster for downloads/decoding) with
`Cache-Control: no-store`; T-10's evidence machine-decodes the PNG (pngjs + jsqr) back to the
exact `/verify?token=…` URL and cross-checks the fn output against an independent Node HMAC
recomputation. `private` remains unexposed; any future secret consumer follows this pattern.

### D-018 — Public verify is read-only and token-only for anonymous callers · **Active** · 2026-10-24
**Context** T-11 makes `/verify` public because the QR is scanned at the gate, often by a guard's
phone with no session. But `gate_verification_logs.gate_user_id` is NOT NULL, so the previous
SECURITY.md wording "every attempt writes `gate_verification_logs`" was unachievable for anonymous
scans. Separately, `MPGI-*` pass codes carry only 24 bits of entropy — a public endpoint that
resolved codes would be trivially enumerable.
**Decision** Migration `0011` adds `fn_gate_verify(p_token_or_code)` (SECURITY DEFINER, stable,
EXECUTE to anon+authenticated): a READ-ONLY classifier that never writes logs. Anonymous callers may
present only the 256-bit raw token; the `MPGI-*` code path is gated to security/admin, with an
explicit NULL-role guard so an anonymous caller cannot slip through a `NOT IN` that evaluates to
NULL. `fn_gate_record` remains the sole writer (security/admin) and appends one row per
authenticated recording attempt; unknown probes are refused without a row because a log requires a
pass reference. The public surface returns holder, pass code, department, validity window and exit
state — never reason, explanation, document links or health text.
**Consequences** "Every attempt" in SECURITY.md now means every authenticated *recording* attempt;
anonymous scans are intentionally unlogged because there is no identity to bind. Anonymous probing
is mitigated by the 256-bit token and rate limiting (KI-009), not by audit rows. The token travels
in the URL by design (D-015), so edge/access-log retention must be limited at go-live; the page
itself sends `no-store`, `no-referrer` and `noindex`.
