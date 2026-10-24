# ARCHITECTURE — PratapPass

Status: **design blueprint, being implemented** — T-01 scaffold + T-02/T-02a auth live; portal
subsystems arrive T-03+ (see `TASKS.md`).

---

## 1. System overview

```
┌───────────────────────────────────────────────────────────────┐
│  Client (browser / mobile)                                    │
│  Next.js App Router — React Server Components + shadcn/ui     │
└──────────────┬───────────────────────────────┬────────────────┘
               │ server data (RLS)             │ form mutations
               ▼                               ▼
┌───────────────────────────────────────────────────────────────┐
│  Next.js (Vercel)                                             │
│  • Server Components: data reads via anon-key client (+RLS)    │
│  • Server Actions: validated mutations (Zod + role checks)     │
│  • Route handlers: QR image, upload endpoints, gate verify     │
│  • server-only module holds SERVICE_ROLE_KEY (RLS-free ops)   │
└──────────────┬───────────────────────────────┬────────────────┘
               ▼                               ▼
┌───────────────────────┐        ┌─────────────────────────────┐
│  Supabase Auth        │        │  Supabase Postgres          │
│  email/password       │        │  10 tables + RLS policies   │
│  JWT carries app role │        │  SECURITY DEFINER functions │
└───────────────────────┘        │  enforce workflow states    │
                                 └──────────────┬──────────────┘
                                                ▼
                                 ┌─────────────────────────────┐
                                 │  Supabase Storage            │
                                 │  PRIVATE bucket:             │
                                 │  medical-documents/{app}/{id}│
                                 │  access = short-lived        │
                                 │  server-minted signed URLs   │
                                 └─────────────────────────────┘
```

**Core principle:** the browser only ever talks to Next.js. Authorization lives in Postgres RLS +
Postgres functions; the service-role key stays in a `server-only` module. No medical document is
ever served from a public URL.

## 2. Route map (planned)

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Landing page (MPGI-styled): notices, hero, stats, links to portal/login |
| `/login`, `/register` | Public | Auth screens (roll-number student signup; staff login) |
| `/student` | student | Dashboard: my requests summary cards + live status (near-real-time: 15 s server-component re-read) |
| `/student/apply` | student | Application form (conditional medical upload) |
| `/student/requests`, `/student/requests/[id]` | student | History; detail + timeline + remarks + info-update flow |
| `/student/passes`, `/student/passes/[id]` | student | Issued passes; QR card (no-store `/api/passes/[id]/qr`) + print stylesheet + SVG/PNG download — prints only the pass block |
| `/student/profile` | student | Profile & account |
| `/approver/requests` | faculty, hod | Decision queue for the actor's scope (reachable pending step only; assignment honored by RLS) |
| `/approver/requests/[id]` | faculty, hod | Detail: application + documents preview (audited ≤5-min 307, `/api/documents/[id]`) + timeline + decision panel (rendered only when the reachable pending step matches the viewer; actions route through `fn_decide_application`) |
| `/approver/history` | faculty, hod | The actor's OWN recorded decisions (append-only rows, actor-scoped) with processing time from submission |
| `/admin` | admin | Console entry — redirects to `/admin/departments` (T-12a) |
| `/admin/departments` | admin | Department list + create (T-12a) |
| `/admin/departments/[id]` | admin | Edit + guarded delete; refused while referenced (T-12a) |
| `/admin/users` | admin | User list + create; server-side search, role filters, generated one-time password (T-12b) |
| `/admin/users/[id]` | admin | Edit role/department/roll/designation + reset password; no delete surface (T-12b) |
| `/admin/rules` | admin | Approval & document rule matrix (T-12c, planned) |
| `/admin/analytics`, `/admin/audit` | admin | Metrics; audit log viewer (T-13, planned) |
| `/verify` | Public (recording: security/admin) | **Gate verification page** (token URL from QR) — holder/code/department/window/exit-state only, never reason/medical data; read-only `fn_gate_verify`; security/admin get code entry + exit/return/rejection recording via `fn_gate_record` |

Middleware protects role prefixes and redirects unauthenticated/unauthorized access to `/login`.

## 3. Backend surfaces

Mutations use **Next.js Server Actions** (typed, Zod-validated); a minimal set of **route
handlers** exists for things Server Actions can't express (QR image route, `GET /verify`
token flow, programmatic gate-record endpoint). Contracts: `API.md`.

Workflow-critical writes (status transitions, approvals, pass issuance) go through Postgres
**SECURITY DEFINER functions** (`DATABASE.md` §5) that verify the acting role and chain order —
clients get no direct UPDATE grant on workflow tables.

## 4. Key data flows

### Submission (student)
```
student → /student/apply (client form)
→ Server Action: Zod validates fields + optional files (*MIME sniffed server-side)
→ storage.upload(private bucket, path=appId/uuid.ext, no public URL)
→ insert gate_pass_applications (status=submitted) + medical_documents rows
→ approval_steps router creates chain rows (rule lookup; emergency ⇒ expedited)
→ notify assigned approvers; audit_logs += submission
```

### Decision (approver)
```
approver → /approver/requests/[id] (read via RLS: dept-scope only)
   document preview: GET /api/documents/[id] → server checks role+scope →
   audit doc access → returns 5-min signed URL → browser fetch of bucket
→ Server Action decision { approve | reject | request_info, remarks }
→ Postgres function validates chain order + appends approval_actions
→ status advances (or HOD is next step) → notify student / notify next approver
→ final approval trigger creates gate_passes row (hashed token, expiry)
```

### Gate verification (security)
```
student shows QR  →  camera opens GET /verify?token=...
→ server: fn_gate_verify(probe) — anonymous token-only; hash lookup + classification
→ result page: pass valid? holder name, dept, validity window, exit/return state
→ security/admin: POST /api/gate/record {token, event: exit|return|rejection}
→ fn_gate_record → gate_verification_logs (one row per authenticated attempt)
→ return event completes application (status=completed) or flags rejection cases
```
The verify page never renders reason/medical wording/documents.

## 5. Folder structure (to be created at T-01)

```
app/
  (public)/            page.tsx, verify/
  (auth)/              login/, register/
  (student)/           dashboard, apply, requests/, passes/, profile
  (approver)/          dashboard, requests/[id], history/
  (admin)/             departments/, users/, rules/, analytics/, audit/
  api/                 documents/[id]/, passes/[id]/qr/, gate/
components/
  ui/                  shadcn primitives (generated)
  app/                 status-badge, application-form, decision-panel, pass-qr, …
lib/
  supabase/            client helpers (browser / server / server-only admin)
  validation/          shared Zod schemas
  domain/              status machine helpers, rule lookups
supabase/
  migrations/          0001_init.sql … (DATABASE.md is the source of truth)
  seed.sql             synthetic demo data
tests/                 authorization + workflow tests (task T-15 …)
```

## 6. Technical constraints & notes

- **Vercel functions**: no long-running processes; signed URLs (max ~5 min TTL) replace any
  proxy-download of medical files; QR is generated server-side per request (cheap, no cache of
  tokens).
- **Storage**: private bucket; user-metadata mime claims are re-verified server-side at access
  time from stored content type.
- **Time handling**: all timestamps `timestamptz`; "departure window" comparisons run in
  Asia/Kolkata institutional context (config).
- **Notifications**: in-app rows (DB). Email is a later, swappable integration (`KNOWN_ISSUES.md`).
- **Secrets**: `NEXT_PUBLIC_*` only for URL/anon key; `SUPABASE_SERVICE_ROLE_KEY` allocated to a
  `server-only` module — enforced by import convention + review.
- See `SECURITY.md` for the threat model, `DATABASE.md` for schema/RLS/state machine.
