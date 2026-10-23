// T-02 evidence script — exercises the same public signup path as the app:
// signUp (roll_number in user metadata) -> auth.users trigger -> profiles row.
// Run: node --env-file=.env.local scripts/dev/signup-demo.mjs
// Dev-only; not wired into npm scripts (production never seeds like this).
import { createClient } from "@supabase/supabase-js";

const email = "student.demo@pratappass.test";
const password = "DemoPassw0rd!";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const { data: availableFirst } = await supabase.rpc("check_roll_number_available", {
  candidate: "DEMO24001",
});
console.log("check_roll_number_available(DEMO24001) before signup:", availableFirst);

const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { full_name: "Demo Student", roll_number: "DEMO24001" } },
});
if (error) {
  console.error("signup error:", error.message);
  process.exit(1);
}
console.log(
  "signUp: user created =",
  Boolean(data.user),
  "| session returned =",
  Boolean(data.session),
);

// Re-check must now be false — uniqueness boundary works.
const { data: availableSecond, error: rpcError } = await supabase.rpc(
  "check_roll_number_available",
  { candidate: "DEMO24001" },
);
console.log(
  "check_roll_number_available(DEMO24001) after signup (expect false):",
  rpcError ? `rpc error: ${rpcError.message}` : availableSecond,
);
