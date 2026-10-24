import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Local test harness. The suite talks to the SAME local Postgres instance the
 * Supabase CLI starts (port 54322) and never resets it: every write fixture runs
 * inside a transaction that rolls back. Set `SUPABASE_DB_URL` to point at another
 * database (CI service container), but seed it first (`supabase db reset`).
 */
const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const PSQL_ARGS = [DB_URL, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"];

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Run SQL and return trimmed stdout. Throws (with psql stderr) on SQL failure. */
export function psql(sql: string): string {
  return execFileSync("psql", [...PSQL_ARGS, "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Run a .sql fixture file (supports psql `\ir` includes relative to it). */
export function psqlFile(file: string): string {
  return execFileSync("psql", [...PSQL_ARGS, "-f", file], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Run SQL that is expected to fail; returns psql's stderr for assertions. */
export function psqlFailure(sql: string): string {
  const result = spawnSync("psql", [...PSQL_ARGS, "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) {
    throw new Error(`Expected psql to fail, but it succeeded.\nstdout:\n${result.stdout}`);
  }
  return result.stderr;
}

export function psqlJson<T>(sql: string): T {
  return JSON.parse(psql(sql)) as T;
}

export type DbRole = "authenticated" | "anon";

/**
 * Simulate a PostgREST session inside one transaction: `set local role` applies
 * table grants/RLS, and `request.jwt.claims` drives `auth.uid()`. The transaction
 * is always rolled back, so read-only matrix tests cannot leak writes.
 */
export function roleSql(
  role: DbRole,
  uid: string | null,
  body: string,
  setup = "",
): string {
  const claims =
    uid === null
      ? `do $$ begin perform set_config('request.jwt.claims', '', true); end $$;`
      : `do $$ begin perform set_config('request.jwt.claims', ${sqlLiteral(
          JSON.stringify({ sub: uid, role: "authenticated" }),
        )}, true); end $$;`;
  return `begin; ${setup} set local role ${role}; ${claims} ${body} rollback;`;
}

/** Seed identities from supabase/seed.sql (fixed UUIDs, synthetic data). */
export const IDS = {
  studentCse: "00000000-0000-0000-0000-000000000001",
  studentEce: "00000000-0000-0000-0000-000000000002",
  facultyCse: "00000000-0000-0000-0000-000000000003",
  hodCse: "00000000-0000-0000-0000-000000000004",
  security: "00000000-0000-0000-0000-000000000005",
  admin: "00000000-0000-0000-0000-000000000006",
  deptCse: "00000000-0000-0000-0000-000000000101",
  deptEce: "00000000-0000-0000-0000-000000000102",
  appCseMedical: "00000000-0000-0000-0000-000000002001",
  appEcePersonal: "00000000-0000-0000-0000-000000002002",
  appCseEmergency: "00000000-0000-0000-0000-000000002003",
  passCseEmergency: "00000000-0000-0000-0000-000000002103",
} as const;

export const SEED_UIDS = [
  IDS.studentCse,
  IDS.studentEce,
  IDS.facultyCse,
  IDS.hodCse,
  IDS.security,
  IDS.admin,
];

/** Fail fast with an actionable message when the local DB was not seeded. */
export function assertSeedData(): void {
  const count = psql(
    `select count(*) from public.profiles where id in (${SEED_UIDS.map(sqlLiteral).join(",")})`,
  );
  if (count !== String(SEED_UIDS.length)) {
    throw new Error(
      `Local Supabase seed data is missing (${count}/${SEED_UIDS.length} demo profiles found). ` +
        "Run `supabase db reset` (local only) or point SUPABASE_DB_URL at a seeded database.",
    );
  }

  const rules = psql(
    `select count(*) from public.approval_rules
      where (department_id = '${IDS.deptCse}' and reason = 'personal')
         or (department_id is null and reason = 'medical')`,
  );
  if (rules !== "2") {
    throw new Error(
      "Seed approval rules are missing (CSE personal + global medical). Run `supabase db reset`.",
    );
  }
}
