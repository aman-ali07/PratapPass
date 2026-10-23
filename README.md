# PratapPass

> **Status: 🚧 Build in progress — T-01 scaffold complete (MPGI theme compiled, checks green).
> Portal features pending: see [`TASKS.md`](TASKS.md).**
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

- Node.js 20+ and npm
- A Supabase project (Postgres + Auth + Storage) — create one at [supabase.com](https://supabase.com)
- Supabase CLI (for migrations) — optional for app development, required for DB workflows
- *Exact prerequisite steps will be verified and finalized with the project scaffold (task T-01).*

## Setup (verified at T-01 scaffold)

```bash
git clone <repository-url> pratappass && cd pratappass
npm install
cp .env.example .env.local   # fill values from your Supabase project (see .env.example)
npm run dev                  # http://localhost:3000
```

> Environment variables are documented in `.env.example` and `SECURITY.md`. **Never commit `.env*`
> files.**

## Scripts (live since T-01)

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript strict checks |
| `npm run test` | Test suite (authorization + workflow tests) — *added at T-15* |
| `npx supabase ...` | Local DB + migrations — *from T-02 onward* |

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
