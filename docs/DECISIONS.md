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
Repository was empty at setup. Every doc asserts the **documentation-foundation** status banner;
all features described as planned; "Completed work: none" states the truth in `TASKS.md`. No
historical claims or fabricated changelog dates are permitted.

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
