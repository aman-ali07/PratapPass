// T-03 RLS smoke fixture — creates THROWAWAY synthetic users through the
// admin API (service role, server-side only). Local restore DB only; T-05's
// seed migration will replace this with idempotent SQL seeding.
// Run: node --env-file=.env.local scripts/dev/rls-smoke-seed.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set for the smoke seed");

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FAMILIES = [
  { email: "smoke.student2@pratappass.test", full_name: "Smoke Student II", roll_number: "DEMO24002" },
  { email: "smoke.faculty@pratappass.test", full_name: "Smoke Faculty", roll_number: null },
  { email: "smoke.admin@pratappass.test", full_name: "Smoke Admin", roll_number: null },
];

for (const spec of FAMILIES) {
  const { data, error } = await admin.auth.admin.createUser({
    email: spec.email,
    email_confirm: true,
    user_metadata: { full_name: spec.full_name, ...(spec.roll_number ? { roll_number: spec.roll_number } : {}) },
  });
  if (error) {
    console.error("createUser failed:", spec.email, error.message);
    process.exit(1);
  }
  console.log("created user:", data.user.email, data.user.id);
}
console.log("smoke users ready (roles/departments are set via SQL next)");
