# PratapPass

**Digital gate-pass and medical-document approval system for Maharana Pratap Group of Institutions
(MPGI), Kanpur.**

![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3FCF8E?logo=supabase)
![Tests](https://img.shields.io/badge/tests-32%20DB--backed-brightgreen)

> **Status: feature-complete MVP, verified locally, not yet deployed.**
> Tasks T-01 → T-15 are implemented with evidence in [`TASKS.md`](TASKS.md): 32 database-backed
> tests pass and the production build is clean. Cloud deployment waits on institutional Supabase
> credentials ([`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) KI-002), and the public landing page is still the
> original scaffold placeholder — use `/login` with a demo account to explore the app.

PratapPass replaces the paper gate-pass process: students apply online, attach medical documents
when required, and track approvals in real time. Faculty and HODs decide through a configurable
chain, security staff verify a QR pass at the gate, and administrators get approval rules, analytics,
and an append-only audit trail.

The interesting part is the security model: **authorization lives in Postgres** — row-level
security plus `SECURITY DEFINER` workflow functions — not in client code. The browser never receives
a storage credential, and medical files are only reachable through short-lived, audited signed URLs.

---

## Screenshots

All images use the local synthetic demo database — no real student data. The application detail and
the faculty review show the same seeded medical request from each side. The demo pass window had
already elapsed when the pass screenshot was taken, so that page shows its expiry state (and
`/verify` refuses it, correctly).

| Student dashboard | Application detail (student view) |
|---|---|
| ![Student dashboard](docs/screenshots/student-dashboard.png) | ![Application detail](docs/screenshots/application-detail.png) |

| Faculty review (same request) | Admin analytics |
|---|---|
| ![Faculty review](docs/screenshots/approver-review.png) | ![Admin analytics](docs/screenshots/admin-analytics.png) |

| Approval rules | Append-only audit log |
|---|---|
| ![Approval rules](docs/screenshots/admin-rules.png) | ![Audit log](docs/screenshots/admin-audit.png) |

| QR gate pass (mobile) |
|---|
| <img src="docs/screenshots/gate-pass-mobile.png" alt="QR gate pass on mobile" width="360"> |

## What is implemented

- **Student workflow** — register with roll number + email + password, submit a gate-pass request
  (medical / personal / emergency), upload a PDF/JPG/PNG medical document (≤ 4 MiB, magic-byte
  checked), track status and remarks, answer information requests, and view issued passes.
- **Approval workflow** — department-scoped review queue, document preview through audited
  short-lived signed URLs, approve / reject / request-info with remarks, and an immutable decision
  history. Emergency requests route straight to the HOD.
- **Configurable rules** — global defaults plus per-department overrides control the approval chain,
  whether a medical document is required, and pass validity (1–720 hours).
- **QR gate pass** — a pass is issued automatically on final approval. The QR encodes a verification
  URL with a deterministic HMAC token; only the token's hash is stored. The verification page exposes
  holder, department, validity window, and exit state — never the reason or medical details.
- **Gate operations** — security/admin staff record exit, return, or rejection; a return completes
  the application. Every recorded gate event is appended to `gate_verification_logs`.
- **Admin console** — departments, staff provisioning with one-time passwords, role/department
  changes, approval rules, analytics (counts, approval rate, processing time, overdue), and an
  append-only audit viewer with filters and pagination.
- **Accessibility & responsive layout** — server-rendered pages, keyboard focus states, skip links,
  ≥ 44 px touch targets, and tables that become labelled cards below 768 px.

## Try it locally

### Prerequisites

- Node.js 20.12+ and npm
- Docker (for the Supabase CLI local stack)
- `psql` only if you want to run the database tests

### 1. Start the stack

```bash
git clone https://github.com/aman-ali07/PratapPass.git
cd PratapPass
npm install

./node_modules/.bin/supabase start
./node_modules/.bin/supabase db reset      # migrations + synthetic demo seed
./node_modules/.bin/supabase status -o env # prints local keys
```

### 2. Configure `.env.local`

Create `.env.local` with the values printed by `supabase status -o env`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from status>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from status>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The service-role key bypasses RLS and is imported only by server-only modules. Never expose it with
a `NEXT_PUBLIC_*` name or commit `.env.local`. All variables are documented in
[`.env.example`](.env.example).

### 3. Run

```bash
npm run dev
```

Open <http://localhost:3000/login>. The landing page is still a placeholder; the app starts at
`/login`.

### Demo accounts (local seed only)

Password for every account: `DemoPassw0rd!`

| Role | Email | Scope | Open after login |
|---|---|---|---|
| Student | `aarav.demo@pratappass.test` | CSE, roll `24FAKE0001` | `/student` |
| Student | `isha.demo@pratappass.test` | ECE, roll `24FAKE0002` | `/student` |
| Faculty | `faculty.demo@pratappass.test` | CSE review queue | `/approver/requests` |
| HOD | `hod.demo@pratappass.test` | CSE final approval | `/approver/requests` |
| Security | `security.demo@pratappass.test` | Gate verification + recording | `/verify` |
| Admin | `admin.demo@pratappass.test` | Full console | `/admin` |

There is no cross-portal navigation bar yet, so staff should open their portal URL directly.

These identities exist **only** in `supabase/seed.sql`, which `supabase db push` never applies to a
cloud project. They are intentionally synthetic.

## How a request flows

```mermaid
flowchart LR
  A[Student submits<br/>+ optional document] --> B[Faculty review]
  B -->|request info| A
  B -->|approve| C{Chain has HOD?}
  C -->|yes| D[HOD review]
  C -->|no| E[Pass issued]
  D -->|approve| E
  B -->|reject| R[Rejected]
  D -->|reject| R
  E --> F[Security scans QR]
  F --> G[Record exit]
  G --> H[Record return]
  H --> I[Application completed]
```

Emergency requests use an expedited single-step chain directly to the HOD; the medical default is
faculty → HOD, while the personal default is HOD only. Every transition is performed by a Postgres
function that re-checks the actor's role, department, chain position, and application state. There is
no client-side status update path.

## Architecture at a glance

```mermaid
flowchart TB
  subgraph Browser
    UI[Next.js React UI<br/>server components by default]
  end
  subgraph Vercel
    APP[Next.js App Router<br/>server actions + route handlers]
  end
  subgraph Supabase
    AUTH[Auth<br/>email + password]
    DB[(Postgres<br/>RLS + SECURITY DEFINER)]
    STORE[(Private storage<br/>medical documents)]
  end
  UI --> APP
  APP --> AUTH
  APP --> DB
  APP -->|signed URLs only| STORE
```

- **Next.js 15 App Router + React 19 + Tailwind CSS 4 + shadcn/ui.**
- **Supabase** provides Postgres, Auth, and a private Storage bucket.
- **Reads** go through the anon-key client and are filtered by RLS.
- **Writes** go through validated server actions or the gate-record API → `SECURITY DEFINER`
  functions; the other route handlers are read-only (QR image, document redirect, gate verify).
- **Tests** run against real local Postgres, not mocks.

A deeper, plain-language walkthrough of every module and function is in
[`docs/PROJECT_GUIDE.md`](docs/PROJECT_GUIDE.md).

## Repository tour

| Path | What lives there |
|---|---|
| `app/` | Routes, layouts, server actions, and API route handlers |
| `app/student/`, `app/approver/`, `app/admin/` | Role portals |
| `app/verify/` | Public QR verification + security recording |
| `app/api/` | QR image, document signed-URL redirect, gate verify/record JSON APIs |
| `components/` | UI components: layout, auth, student, approver, admin, shadcn primitives |
| `lib/` | Supabase clients, Zod schemas, document sniffing, gate helpers, formatting |
| `supabase/migrations/` | 16 versioned SQL migrations (schema, RLS, workflow functions, admin RPCs) |
| `supabase/seed.sql` | Synthetic demo identities and sample applications |
| `tests/` | Vitest suites + transactional SQL fixtures |
| `scripts/test.sh` | Local CI-equivalent gate: typecheck + lint + tests |
| `scripts/dev/` | Opt-in browser/API smoke scripts used as evidence during development |
| `docs/` | Decision log + the project guide |

## Testing

```bash
./node_modules/.bin/supabase start
./node_modules/.bin/supabase db reset   # local only
./scripts/test.sh                       # typecheck + lint + 32 tests
npm run build                           # production build
```

The suite connects to the real local database (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
override with `SUPABASE_DB_URL`). It simulates PostgREST sessions with `set local role` and
`request.jwt.claims`; every write fixture runs in a transaction that is rolled back.

| File | Proves |
|---|---|
| `tests/validation.test.ts` | Magic-byte document checks, size/type limits, Zod request boundaries |
| `tests/rls.test.ts` | Five roles × eleven tables see exactly their scope; direct writes and role escalation are denied |
| `tests/workflow.test.ts` | Submit → info request → answer → faculty → HOD → pass → exit → return → completed, plus denial probes |
| `tests/qr-verify.test.ts` | Token derivation is owner/admin-only; anonymous verification never exposes medical data |

CI is intentionally not configured. The same commands can run in any pipeline later.

## Documentation

| Document | Purpose |
|---|---|
| [`docs/PROJECT_GUIDE.md`](docs/PROJECT_GUIDE.md) | Plain-language module/function reference with diagrams |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System design, routes, data flows, folder layout |
| [`DATABASE.md`](DATABASE.md) | Schema, RLS matrix, state machine, migrations, functions |
| [`API.md`](API.md) | Server action and route-handler contracts |
| [`SECURITY.md`](SECURITY.md) | Threat model, authorization, document privacy |
| [`PRD.md`](PRD.md) | Product requirements and user stories |
| [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | Brand tokens, components, accessibility |
| [`TECH_STACK.md`](TECH_STACK.md) | Pinned versions and dependency rationale |
| [`TASKS.md`](TASKS.md) | Task history with acceptance evidence |
| [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) | Confirmed limitations and open questions |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Architecture decision log (D-001 → D-024) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Local setup, conventions, PR checklist |

## Known limitations

- **Not deployed yet.** A cloud Supabase project (URL + keys + production `qr_token_secret`) is
  still required (KI-002).
- **Landing page placeholder.** `/` still shows the T-01 scaffold badge; the portals are complete.
- **No cross-portal navigation.** Staff land on `/student` after login and must open their portal
  URL directly (see the demo table).
- **No email delivery.** Decisions and notifications are in-app only (KI-003).
- **No user deactivation.** Staff accounts can be edited/reset but not disabled yet (KI-015).
- **Password reset does not revoke existing sessions** (KI-016).
- **No rate limiting / bot protection** on public endpoints yet (KI-009).
- **The apply form is reason-driven, not rule-driven.** A rule that requires a document for a
  non-medical reason is enforced by the database but only surfaced at submit time (KI-013).
- **A rejected request can leave a stale later approval step**, so a later approver may see it in
  their queue with no possible action (KI-019).

## Contributing

Issues and pull requests are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) first; it covers the
local setup, coding conventions, the database-test requirement, and the PR checklist. This project
also has [`AGENTS.md`](AGENTS.md) for AI-assisted contributions.

## License

No open-source license has been granted. The repository is public for review and demonstration;
copyright remains with the author. If you want to reuse it, open an issue to discuss.
