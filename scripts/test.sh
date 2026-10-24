#!/usr/bin/env bash
# CI-equivalent local gate: static checks + the DB-backed test suite.
# Requires the pinned local Supabase stack (seeded via `supabase db reset`) and psql.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v psql >/dev/null || {
  echo "psql is required for the DB-backed tests (install postgresql-client)." >&2
  exit 1
}

npm run typecheck
npm run lint
npm run test
