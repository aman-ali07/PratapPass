# Contributing to PratapPass

Thanks for taking a look. PratapPass is a working MVP for MPGI's gate-pass workflow, built as a
reference implementation of a security-first Next.js + Supabase application. Contributions are
welcome — bug reports, documentation fixes, accessibility improvements, and focused features.

Please read this file and [`AGENTS.md`](AGENTS.md) before opening a substantial pull request.
For a code tour, start with [`docs/PROJECT_GUIDE.md`](docs/PROJECT_GUIDE.md).

## Ground rules

- **No real student data.** Use the synthetic seed identities or create new fake fixtures. Medical
  documents in commits/tests must be obviously fake.
- **No secrets.** Never commit `.env*` files (except `.env.example`), keys, tokens, or production
  URLs. Configuration belongs in `.env.local`.
- **Do not weaken security controls.** Auth, RLS, validation, audit logging, and document access are
  the point of this project. A change that bypasses a `SECURITY DEFINER` function or broadens a
  policy needs an explicit design discussion first.
- **Small, reviewable diffs.** No drive-by refactors, reformatting, or unrelated dependency bumps.
- **Keep docs honest.** If a feature is not implemented, do not describe it as implemented. Update
  `KNOWN_ISSUES.md` when you find a limitation.

## Local setup

Prerequisites: Node.js 20.12+, npm, Docker, and `psql` for the database tests.

```bash
git clone https://github.com/aman-ali07/PratapPass.git
cd PratapPass
npm install

./node_modules/.bin/supabase start
./node_modules/.bin/supabase db reset
./node_modules/.bin/supabase status -o env
```

Create `.env.local` from the printed values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Then:

```bash
npm run dev
```

Open <http://localhost:3000/login>. Demo password: `DemoPassw0rd!`. Accounts are listed in the
[README](README.md#demo-accounts-local-seed-only).

> `supabase db reset` is local-only and safe. Do not run it against a shared/cloud database.

## Project conventions

### TypeScript and React

- TypeScript strict mode; **no `any`**. Use `unknown` plus narrowing, or a Zod-inferred type.
- Server components by default. Add `"use client"` only when a component needs state, effects, or
  browser APIs; keep client boundaries small.
- Use the existing Supabase clients:
  - `createSupabaseServerClient()` for session/RLS reads and RPCs.
  - `createSupabaseAdminClient()` only in server-only modules for narrow service-role operations.
  - Never import the service-role client into a client component or expose the key with a
    `NEXT_PUBLIC_*` name.

### Validation and errors

- Validate every boundary with a shared Zod schema (forms, actions, route handlers, files).
- Return typed `{ ok, error, fieldErrors }` states from form actions.
- Never swallow an error (`catch {}` is forbidden). Log server-side and show user-safe copy.
- Use the existing `friendly*Error` allow-lists; do not expose raw Postgres/GoTrue messages.

### Naming and layout

- `camelCase` for TypeScript, `snake_case` for database identifiers, `kebab-case` for route paths.
- Component files are `PascalCase.tsx`; utility modules are `kebab-case.ts`.
- Comments explain **why** (invariants, trade-offs), not what the next line does.
- No placeholder buttons. An unfinished surface must not look operable.

### Database changes

- Add a **new** migration under `supabase/migrations/`; never edit an applied migration.
- Every table gets RLS enabled and policies for the intended roles.
- Workflow transitions belong in `SECURITY DEFINER` functions with an explicit caller check,
  `search_path = public`, and `EXECUTE` revoked from `anon`/`public` unless intentionally public.
- Keep `approval_actions`, `gate_verification_logs`, and `audit_logs` append-only.
- Regenerate types after the migration:

  ```bash
  ./node_modules/.bin/supabase gen types typescript --local > lib/supabase/database.types.ts
  ```

- Update `DATABASE.md` (schema/policies/functions/migration table) and `API.md` if a contract changes.

## Verification

Run the same gate locally:

```bash
./scripts/test.sh     # tsc --noEmit + eslint + vitest (32 tests)
npm run build
```

The tests need a running, seeded local stack and `psql`. They use real Postgres sessions and roll
back every write fixture.

If your change touches a workflow rule, add a **denial probe** to `tests/fixtures/workflow.sql` or
`tests/fixtures/qr-verify.sql`: prove the forbidden action fails, not just that the allowed one
succeeds.

For UI changes, exercise the actual screens in a browser at 360 px and desktop width. The opt-in
scripts in `scripts/dev/` show the expected shape (they need a running app and seeded users).

## Pull request checklist

- [ ] The diff is minimal and matches the linked issue.
- [ ] `./scripts/test.sh` passes.
- [ ] `npm run build` passes.
- [ ] New behavior is covered by a real assertion (test or documented smoke evidence).
- [ ] No secrets, `.env*`, or real PII.
- [ ] Docs updated: `TASKS.md` if task-related, `KNOWN_ISSUES.md` if a limitation was found, plus the
      affected area doc.
- [ ] The PR description states **what changed**, **how it was verified** (commands/output), and
      **what remains**.

Use the PR template; screenshots are welcome for UI changes.

## Commit messages

Keep the existing style: a short imperative subject, optionally prefixed with the task or area.

```text
T-15: add DB-backed authorization tests
fix: reject expired QR tokens on the verify page
docs: clarify document retention policy
```

## Reporting security issues

Please do **not** open a public issue for a vulnerability. Use GitHub's private security advisory
feature on this repository, or contact the maintainer through their GitHub profile. Include a
description, reproduction steps, and impact. Never include real credentials or student data.

## Code of conduct

Be respectful and specific. Critique code, not people. Assume good faith, ask before large changes,
and keep discussions on the technical merits. Harassment or discrimination is not welcome.

## License

No open-source license has been granted. By submitting a contribution you agree that it may be
included in this repository under the same terms; copyright remains with the author. If you need
reuse rights, open an issue first.
