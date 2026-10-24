# PratapPass

> **Status: 🚧 Build in progress — T-01 (scaffold/MPGI theme) and T-02/T-02a (auth + profile
> policies on the local Supabase CLI stack) are complete with evidence. Portal features pending:
> see [`TASKS.md`](TASKS.md).**
> Data/auth/UI features remain planned until their task is marked ✅ with evidence.

**PratapPass** is the digital gate-pass and medical document approval system for **Maharana Pratap
Group of Institutions (MPGI), Kanpur**. It replaces the paper gate-pass process: students apply
online, upload supporting medical documents, and track approvals in real time — faculty and HOD
review and decide from a dashboard, and security staff verify approved passes with a QR code at the
gate.

## Why it exists

The manual process (paper forms, physical document submission, in-person follow-up) delays student
departures, wastes staff time, and makes request tracking nearly impossible. PratapPass centralizes
submission, approval, verification, and auditing — with strict privacy controls for medical
records.

## Users & roles

| Role | What they do |
|---|---|
| **Student** | Register (roll number + email), submit gate-pass applications, upload medical documents, track status in real time, download/scan approved passes |
| **Faculty / Dept. Approver** | Review department requests + documents, approve / reject / request more info with remarks, view history |
| **HOD / Admin** | Manage students, staff, departments & approval rules; monitor requests; view analytics & audit logs |
| **Security / Gate Staff** | Verify passes via QR, record actual exit/return times, reject invalid or expired passes |

Requirements and detailed user stories: see `PRD.md`.

## Planned feature highlights

- Online application form (medical / emergency / personal / other) with conditional medical-document
  upload (PDF, JPG, PNG; size + type validated)
- Configurable approval chain (Faculty → HOD) with expedited routing for emergencies
- Live status tracking: Submitted → Under Review → Additional Info Required → Approved / Rejected →
  Completed, with in-app notifications
- Time-limited QR gate pass; verification page never exposes medical information
- Admin analytics (counts, approval rate, average processing time, overdue) and append-only audit
  trails
- Modern MPGI-branded responsive UI (deep blue + gold; mobile-first)

## Documentation index

| File | Purpose |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Instructions for AI coding agents (start here) |
| [`PRD.md`](PRD.md) | Product requirements, user stories, acceptance criteria |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System design, routes, data flows |
| [`TECH_STACK.md`](TECH_STACK.md) | Technologies, versions, rationale |
| [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | Brand palette, UI components, accessibility |
| [`DATABASE.md`](DATABASE.md) | Schema, RLS matrix, state machine, migrations |
| [`API.md`](API.md) | Server actions & endpoint contracts |
| [`SECURITY.md`](SECURITY.md) | Auth, authorization, threats, privacy |
| [`TASKS.md`](TASKS.md) | Prioritized task list with status |
| [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) | Confirmed limitations & open questions |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decision log with rationale |
| `.env.example` | Required environment variables (placeholders) |

## Prerequisites

- Node.js 20.12+ (or 22/24) and npm
- *(now)* Local-first dev: the pinned Supabase CLI runs a full local stack — no cloud project needed until go-live (D-013)
- *(go-live, T-15)* A Supabase cloud project (Postgres + Auth + Storage) — keys are pasted into `.env.local` and migrations are pushed with `supabase db push` (KI-002)

## Setup (local-first — verified at T-02a)

```bash
git clone <repository-url> pratappass && cd pratappass
npm install
./node_modules/.bin/supabase start        # local Supabase stack (API/Gateway/Auth/DB) — D-013
./node_modules/.bin/supabase status -o env # generates NEXT_PUBLIC_* + SERVICE_ROLE values
# place the three Supabase vars + NEXT_PUBLIC_SITE_URL=http://localhost:3000 into .env.local
./node_modules/.bin/supabase db reset     # applies all migrations + supabase/seed.sql (local only)
npm run dev                               # http://localhost:3000
```

> *(go-live, T-15)* `cp .env.example .env.local` is then replaced by the **cloud** project's keys;
> migrations are pushed with `supabase db push`. Cloud parity settings: email confirmations on,
> password minimum length 8 (see `KNOWN_ISSUES.md` KI-002).

> Environment variables are documented in `.env.example` and `SECURITY.md`. **Never commit `.env*`
> files.**

## Scripts (live since T-01)

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript strict checks |
| `npm run test` / `npm run test:watch` | DB-backed authorization, workflow, and QR/verify tests (Vitest) |
| `./scripts/test.sh` | CI-equivalent local gate: typecheck + lint + `npm run test` |
| `./node_modules/.bin/supabase start` / `status -o env` / `db reset` | Local DB stack (pinned CLI) — migrations + seed apply on `reset`; `status -o env` generates `.env.local` values |

## Testing

The suite runs against the **real local Postgres**, not mocks. It simulates PostgREST sessions
with `set local role` + `request.jwt.claims`, and every write fixture runs inside a transaction
that is rolled back. It therefore needs a running, seeded local stack:

```bash
./node_modules/.bin/supabase start
./node_modules/.bin/supabase db reset   # local only; applies migrations + demo seed
npm run test                            # or ./scripts/test.sh for typecheck + lint + tests
```

`psql` (PostgreSQL client) must be on `PATH`. The harness connects to
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`; set `SUPABASE_DB_URL` to override it
(for example, a CI service container that has been migrated and seeded).

| File | What it proves |
|---|---|
| `tests/validation.test.ts` | Document magic-byte sniffing, 4 MiB/MIME upload limits, application/gate/info Zod boundaries (including strict JSON bodies) |
| `tests/rls.test.ts` | Five roles × every RLS table see exactly their scope; anonymous sees nothing; direct writes/history rewrites/role escalation and workflow-function calls are denied (with the exact Postgres error) |
| `tests/fixtures/workflow.sql` | Submit → request-info → answer → faculty → HOD → pass issuance → gate exit/return → completed, plus denial probes for skipped steps, wrong actors, missing remarks, and terminal states |
| `tests/fixtures/qr-verify.sql` | QR token derivation is owner/admin-only; anonymous verification accepts raw tokens but not enumerable `MPGI-*` codes; revoked/expired/exit/return classifications; payload contains no reason/medical/explanation keys |

The denial probes are assertions, not comments: if an unauthorized action starts succeeding (or an
authorized one starts failing), the fixture raises and the test fails. Component/visual behavior is
covered by the dev smoke scripts under `scripts/dev/` (they need real browser sessions); Testing
Library is deliberately not installed (D-024).

## Usage

Available after implementation. The core journeys, in order:

1. **Student** registers (roll number) → submits application (+ medical documents if required) →
   tracks status → receives notifications → shows QR pass at gate.
2. **Approver** reviews queued request + documents → approves / requests info / rejects with
   remarks → pass QR is issued on final approval.
3. **Security** scans QR → confirmation page verifies pass validity → records exit/return times.
4. **Admin** configures departments, approver assignments, and approval rules → monitors analytics
   and audit logs.

## Contributing / working with agents

Developers and AI agents must follow [`AGENTS.md`](AGENTS.md): inspect first, minimal diffs,
validate at boundaries, keep `TASKS.md` / `KNOWN_ISSUES.md` updated, and never claim unverified
successes.
