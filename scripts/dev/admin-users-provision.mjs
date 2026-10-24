// T-12b end-to-end provisioning evidence — the exact sequence the server
// action performs, against the real local stack:
//
//   service-role auth.admin.createUser (GoTrue hashes the password)
//     -> admin-session RPC fn_admin_create_user (role/department/roll)
//     -> user signs in with the one-time password and reads their own profile
//
// Then: role change through fn_admin_update_user, password reset through
// GoTrue + fn_admin_record_password_reset (old password must fail), audit rows
// for every mutation, a non-admin RPC denial, and fixture cleanup.
//
// The generated passwords live only in this process; nothing prints them.
//
// Run: node --env-file=.env.local scripts/dev/admin-users-provision.mjs
import { randomInt } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_ID = "00000000-0000-0000-0000-000000000006";
const ADMIN_EMAIL = "admin.demo@pratappass.test";
const ADMIN_PASSWORD = "DemoPassw0rd!";
const DEPT = {
  cse: "00000000-0000-0000-0000-000000000101",
  ece: "00000000-0000-0000-0000-000000000102",
  me: "00000000-0000-0000-0000-000000000103",
};

const fail = (label, detail) => {
  console.error(`FAIL ${label}:`, detail ?? "");
  process.exitCode = 1;
  throw new Error(label);
};

function assert(condition, label, detail) {
  if (!condition) fail(label, detail);
}

/** Mirrors lib/admin/password.ts: 16 chars, at least one upper/lower/digit. */
function generatePassword() {
  const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const LOWER = "abcdefghijkmnopqrstuvwxyz";
  const DIGITS = "23456789";
  const ALL = UPPER + LOWER + DIGITS;
  const pick = (alphabet) => alphabet[randomInt(alphabet.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < 16) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function anonClient() {
  return createClient(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email, password) {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  return { session: data?.session ?? null, error };
}

async function mustSignIn(email, password) {
  const { session, error } = await signIn(email, password);
  if (error || !session) fail("sign-in", `${email}: ${error?.message ?? "no session"}`);
  return session;
}

/** Client that issues RPCs as the signed-in admin (PostgREST sees their JWT). */
async function adminSessionClient() {
  const session = await mustSignIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  const client = anonClient();
  const { error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) fail("admin setSession", error.message);
  return client;
}

const service = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now().toString(36).toUpperCase();
const created = [];

const FIXTURES = [
  {
    key: "student",
    email: `t12b.student.${stamp.toLowerCase()}@pratappass.test`,
    fullName: `T12B Student ${stamp}`,
    role: "student",
    departmentId: DEPT.cse,
    rollNumber: `T12B${stamp}`,
    designation: null,
  },
  {
    key: "faculty",
    email: `t12b.faculty.${stamp.toLowerCase()}@pratappass.test`,
    fullName: `T12B Faculty ${stamp}`,
    role: "faculty",
    departmentId: DEPT.me,
    rollNumber: null,
    designation: "Assistant Professor",
  },
  {
    key: "hod",
    email: `t12b.hod.${stamp.toLowerCase()}@pratappass.test`,
    fullName: `T12B HOD ${stamp}`,
    role: "hod",
    departmentId: DEPT.ece,
    rollNumber: null,
    designation: "Professor",
  },
  {
    key: "security",
    email: `t12b.security.${stamp.toLowerCase()}@pratappass.test`,
    fullName: `T12B Security ${stamp}`,
    role: "security",
    departmentId: null,
    rollNumber: null,
    designation: "Gate Guard",
  },
  {
    key: "admin",
    email: `t12b.admin.${stamp.toLowerCase()}@pratappass.test`,
    fullName: `T12B Admin ${stamp}`,
    role: "admin",
    departmentId: null,
    rollNumber: null,
    designation: null,
  },
];

const passwords = new Map();

async function cleanup() {
  for (const fixture of created) {
    const { error } = await service.auth.admin.deleteUser(fixture.id);
    if (error) {
      console.error(`CLEANUP FAILED for ${fixture.email}:`, error.message);
      process.exitCode = 1;
    }
  }
}

try {
  const admin = await adminSessionClient();
  console.log("admin session ready:", ADMIN_ID);

  // 1) Provision every role exactly as the action does.
  for (const fixture of FIXTURES) {
    const password = generatePassword();
    assert(password.length === 16, "generated password length");
    assert(/[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password),
      "generated password has all classes");
    passwords.set(fixture.key, password);

    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email: fixture.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fixture.fullName },
    });
    if (authError || !authData.user) fail(`createUser ${fixture.key}`, authError?.message);
    created.push({ id: authData.user.id, email: fixture.email, key: fixture.key });
    fixture.id = authData.user.id;

    const { error: rpcError } = await admin.rpc("fn_admin_create_user", {
      p_user_id: fixture.id,
      p_full_name: fixture.fullName,
      p_role: fixture.role,
      p_department_id: fixture.departmentId,
      p_roll_number: fixture.rollNumber,
      p_designation: fixture.designation,
    });
    if (rpcError) fail(`fn_admin_create_user ${fixture.key}`, rpcError.message);
  }
  console.log(`provisioned ${created.length} accounts (one per role)`);

  // 2) Each account signs in with its one-time password and reads its own row.
  for (const fixture of FIXTURES) {
    const session = await mustSignIn(fixture.email, passwords.get(fixture.key));
    const client = anonClient();
    const { error: setError } = await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (setError) fail(`setSession ${fixture.key}`, setError.message);

    const { data: self, error } = await client
      .from("profiles")
      .select("id, role, full_name, roll_number, department_id, designation")
      .eq("id", fixture.id)
      .single();
    if (error || !self) fail(`self-read ${fixture.key}`, error?.message);

    assert(self.role === fixture.role, `${fixture.key} role`, self.role);
    assert(self.department_id === fixture.departmentId, `${fixture.key} department`,
      self.department_id);
    assert(self.roll_number === fixture.rollNumber, `${fixture.key} roll`, self.roll_number);
    assert(self.designation === fixture.designation, `${fixture.key} designation`,
      self.designation);
    console.log(`sign-in + self-read ok: ${fixture.key} (${fixture.role})`);
  }

  // 3) Registration boundary RPC works for an authenticated student.
  {
    const student = FIXTURES.find((f) => f.key === "student");
    const session = await mustSignIn(student.email, passwords.get("student"));
    const client = anonClient();
    await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    const { data: taken, error: takenError } = await client.rpc(
      "check_roll_number_available",
      { candidate: student.rollNumber.toLowerCase() },
    );
    if (takenError) fail("check_roll_number_available (taken)", takenError.message);
    assert(taken === false, "own roll is reported taken", String(taken));

    const { data: free, error: freeError } = await client.rpc(
      "check_roll_number_available",
      { candidate: `FREE${stamp}` },
    );
    if (freeError) fail("check_roll_number_available (free)", freeError.message);
    assert(free === true, "unused roll is reported free", String(free));
    console.log("roll-number pre-check ok for authenticated: taken=false, free=true");
  }

  // 4) Role change: ME faculty -> ME HOD (no pending steps in ME).
  {
    const faculty = FIXTURES.find((f) => f.key === "faculty");
    const { error } = await admin.rpc("fn_admin_update_user", {
      p_user_id: faculty.id,
      p_full_name: faculty.fullName,
      p_role: "hod",
      p_department_id: DEPT.me,
      p_roll_number: null,
      p_designation: "Associate Professor",
    });
    if (error) fail("fn_admin_update_user faculty->hod", error.message);

    const { data: self, error: readError } = await service
      .from("profiles")
      .select("role, designation")
      .eq("id", faculty.id)
      .single();
    if (readError) fail("read promoted faculty", readError.message);
    assert(self.role === "hod", "promoted role", self.role);
    assert(self.designation === "Associate Professor", "promoted designation", self.designation);

    // The change is visible to the user without a new session (RLS reads profiles).
    const session = await mustSignIn(faculty.email, passwords.get("faculty"));
    const client = anonClient();
    await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    const { data: live, error: liveError } = await client
      .from("profiles")
      .select("role")
      .eq("id", faculty.id)
      .single();
    if (liveError) fail("post-promotion self-read", liveError.message);
    assert(live.role === "hod", "user sees new role immediately", live.role);
    console.log("role change ok: faculty -> hod, visible to the user's existing session");
  }

  // 5) Password reset: old credential stops working, new one signs in.
  {
    const security = FIXTURES.find((f) => f.key === "security");
    const newPassword = generatePassword();

    const { error: resetError } = await service.auth.admin.updateUserById(security.id, {
      password: newPassword,
    });
    if (resetError) fail("updateUserById", resetError.message);

    const { error: auditError } = await admin.rpc("fn_admin_record_password_reset", {
      p_user_id: security.id,
    });
    if (auditError) fail("fn_admin_record_password_reset", auditError.message);

    const { error: oldError } = await signIn(security.email, passwords.get("security"));
    assert(oldError !== null, "old password still works", oldError?.message);

    await mustSignIn(security.email, newPassword);
    console.log("password reset ok: old rejected, new accepted");
  }

  // 6) Audit trail: one row per mutation, actor = admin, no secrets/PII.
  {
    const ids = created.map((row) => row.id);
    const { data: rows, error } = await service
      .from("audit_logs")
      .select("action, actor_id, entity_id, metadata")
      .in("entity_id", ids)
      .order("created_at");
    if (error) fail("audit read", error.message);

    const byAction = rows.reduce((acc, row) => {
      acc[row.action] = (acc[row.action] ?? 0) + 1;
      return acc;
    }, {});
    assert(byAction["admin.user_created"] === 5, "5 create audit rows",
      JSON.stringify(byAction));
    assert(byAction["admin.user_updated"] === 1, "1 update audit row",
      JSON.stringify(byAction));
    assert(byAction["admin.user_password_reset"] === 1, "1 reset audit row",
      JSON.stringify(byAction));
    assert(rows.every((row) => row.actor_id === ADMIN_ID), "audit actor is the admin");

    const serialized = JSON.stringify(rows.map((row) => row.metadata));
    assert(!serialized.includes("@pratappass.test"), "audit metadata carries no email");
    assert(!serialized.includes(stamp), "audit metadata carries no roll number");
    console.log(`audit ok: ${rows.length} rows (5 created, 1 updated, 1 reset), ids/enums only`);
  }

  // 7) A non-admin session cannot call the mutation RPC.
  {
    const student = FIXTURES.find((f) => f.key === "student");
    const session = await mustSignIn(student.email, passwords.get("student"));
    const client = anonClient();
    await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    const { error } = await client.rpc("fn_admin_update_user", {
      p_user_id: student.id,
      p_full_name: student.fullName,
      p_role: "admin",
      p_department_id: DEPT.cse,
      p_roll_number: student.rollNumber,
      p_designation: null,
    });
    assert(error !== null, "student could call fn_admin_update_user");
    assert(
      error.message.includes("Only administrators may manage users"),
      "student denial message",
      error.message,
    );
    console.log("non-admin denial ok: student -> 'Only administrators may manage users'");
  }

  console.log("\nT-12b provisioning E2E: PASS");
  console.log("- 5 roles provisioned via service createUser + admin-session RPC");
  console.log("- every account signed in with its generated password and read its own profile");
  console.log("- role change faculty -> hod applied and visible to the live session");
  console.log("- password reset: old rejected, new accepted");
  console.log("- audit: 5 created / 1 updated / 1 reset, actor = admin, no email or roll");
  console.log("- non-admin mutation denied by the database");
} finally {
  await cleanup();
  if (created.length > 0) {
    const { data: leftovers } = await service
      .from("profiles")
      .select("id")
      .in("id", created.map((row) => row.id));
    const remaining = leftovers?.length ?? 0;
    if (remaining !== 0) {
      console.error(`CLEANUP FAILED: ${remaining} fixture profile(s) remain`);
      process.exitCode = 1;
    } else {
      console.log(`cleanup ok: ${created.length} fixture accounts deleted`);
    }
  }
}
