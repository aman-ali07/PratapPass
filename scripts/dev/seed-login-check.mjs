// T-05 evidence script — proves the seed's demo identities actually authenticate
// through GoTrue and can read their own profile (the path every page depends on).
// Run: node --env-file=.env.local scripts/dev/seed-login-check.mjs
// Dev-only; not wired into npm scripts.
import { createClient } from "@supabase/supabase-js";

const CHECKS = [
  { email: "aarav.demo@pratappass.test", role: "student", roll: "24FAKE0001" },
  { email: "faculty.demo@pratappass.test", role: "faculty" },
  { email: "hod.demo@pratappass.test", role: "hod" },
  { email: "security.demo@pratappass.test", role: "security" },
  { email: "admin.demo@pratappass.test", role: "admin" },
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

for (const spec of CHECKS) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: spec.email,
    password: "DemoPassw0rd!",
  });
  if (error || !data.session) {
    console.error(`LOGIN FAILED ${spec.email}:`, error?.message);
    process.exit(1);
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, full_name, roll_number")
    .eq("id", data.user.id)
    .single();
  if (profileError || profile.role !== spec.role) {
    console.error(
      `PROFILE MISMATCH ${spec.email}: expected ${spec.role}, got`,
      profileError?.message ?? profile,
    );
    process.exit(1);
  }
  console.log(`login ok: ${spec.email} -> ${profile.role} (${profile.full_name})`);
}
console.log("all seeded identities sign in and read their own profile");
