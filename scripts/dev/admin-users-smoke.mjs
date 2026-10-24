// T-12b evidence — /admin/users role gates, list/search/filter, and form shapes.
//
// The database contract (create/update/reset guards, audit rows, final-admin
// race) is proven in psql against 0013/0014. This script proves the HTTP
// surface: admin 200 with real rows, server-side search/filter, detail forms
// adapting to the role, malformed/unknown ids 404, and non-admin/anon gates.
//
// The form POST is not browser-driven (same honest limit as T-11/T-12a); the
// actions are typechecked, and scripts/dev/admin-users-provision.mjs exercises
// the same GoTrue + RPC sequence end-to-end.
//
// Run: node --env-file=.env.local scripts/dev/admin-users-smoke.mjs
import { createClient } from "@supabase/supabase-js";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const STUDENT_ID = "00000000-0000-0000-0000-000000000001";
const ADMIN_ID = "00000000-0000-0000-0000-000000000006";
const UNKNOWN_ID = "11111111-1111-1111-1111-111111111111";

const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const fail = (label, detail) => {
  console.error(`FAIL ${label}:`, detail ?? "");
  process.exit(1);
};

function assert(condition, label, detail) {
  if (!condition) fail(label, detail);
}

async function signIn(email) {
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password: "DemoPassw0rd!",
  });
  if (error || !data?.session) fail("login", `${email}: ${error?.message}`);
  return data.session;
}

function authCookie(session) {
  return (
    "sb-127-auth-token=base64-" +
    Buffer.from(JSON.stringify(session), "utf8").toString("base64url")
  );
}

async function get(path, cookie) {
  const response = await fetch(`${SITE}${path}`, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : {},
  });
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    body: await response.text(),
  };
}

const adminCookie = authCookie(await signIn("admin.demo@pratappass.test"));
const studentCookie = authCookie(await signIn("aarav.demo@pratappass.test"));
const facultyCookie = authCookie(await signIn("faculty.demo@pratappass.test"));
const securityCookie = authCookie(await signIn("security.demo@pratappass.test"));

// 1) Admin index still lands on the first built section; Users is now linked.
{
  const res = await get("/admin", adminCookie);
  assert(res.status === 307, "admin /admin status", res.status);
  assert(res.location.includes("/admin/departments"), "admin /admin target", res.location);
}

// 2) List renders rows, filters, and the create form's initial (student) shape.
{
  const res = await get("/admin/users", adminCookie);
  assert(res.status === 200, "admin users status", res.status);
  for (const marker of [
    "Add a user",
    "All users",
    "Search name, roll number, or email",
    "Aarav Demo",
    "aarav.demo@pratappass.test",
    "Dr. Demo Faculty",
    "Admin Demo",
    "Administrator",
    'href="/admin/users"',
    'name="email"',
    'name="role"',
    'name="departmentId"',
    'name="rollNumber"',
  ]) {
    assert(res.body.includes(marker), `admin users renders ${marker}`);
  }
  assert(
    !res.body.includes('name="designation"'),
    "create form hides designation for the default student role",
  );
  assert(!res.body.includes('href="/admin/rules"'), "no dead Rules link");
  assert(!res.body.includes('href="/admin/analytics"'), "no dead Analytics link");
}

// 3) Server-side search and role filter.
{
  const search = await get("/admin/users?q=Aarav", adminCookie);
  assert(search.status === 200, "search status", search.status);
  assert(search.body.includes("aarav.demo@pratappass.test"), "search finds Aarav");
  assert(!search.body.includes("isha.demo@pratappass.test"), "search excludes Isha");
  assert(search.body.includes("1 account"), "search total_count copy");

  const filtered = await get("/admin/users?role=faculty", adminCookie);
  assert(filtered.status === 200, "filter status", filtered.status);
  assert(filtered.body.includes("faculty.demo@pratappass.test"), "filter keeps CSE faculty");
  assert(
    filtered.body.includes("ece.faculty.demo@pratappass.test"),
    "filter keeps ECE faculty",
  );
  assert(!filtered.body.includes("aarav.demo@pratappass.test"), "filter excludes students");
  assert(filtered.body.includes("2 accounts"), "filter total_count copy");

  const nonsense = await get("/admin/users?role=wizard", adminCookie);
  assert(nonsense.status === 200, "invalid role degrades to all", nonsense.status);
  assert(nonsense.body.includes("aarav.demo@pratappass.test"), "invalid role shows all users");
}

// 4) Detail adapts to the role: student → roll, staff → designation.
{
  const student = await get(`/admin/users/${STUDENT_ID}`, adminCookie);
  assert(student.status === 200, "student detail status", student.status);
  for (const marker of [
    "aarav.demo@pratappass.test",
    "Profile and role",
    "Reset password",
    "Accounts are never deleted",
    "24FAKE0001",
    "Computer Science &amp; Engineering",
    'name="rollNumber"',
  ]) {
    assert(student.body.includes(marker), `student detail renders ${marker}`);
  }
  assert(
    !student.body.includes('name="designation"'),
    "student detail hides designation",
  );

  const admin = await get(`/admin/users/${ADMIN_ID}`, adminCookie);
  assert(admin.status === 200, "admin detail status", admin.status);
  assert(admin.body.includes("Admin Demo"), "admin detail name");
  assert(admin.body.includes("Administrator"), "admin detail role");
  assert(admin.body.includes('name="designation"'), "staff detail renders designation");
  assert(!admin.body.includes('name="rollNumber"'), "staff detail hides roll number");
}

// 5) Malformed and unknown ids are indistinguishable 404s.
{
  const malformed = await get("/admin/users/not-a-uuid", adminCookie);
  const unknown = await get(`/admin/users/${UNKNOWN_ID}`, adminCookie);
  assert(malformed.status === 404, "malformed id 404", malformed.status);
  assert(unknown.status === 404, "unknown id 404", unknown.status);
}

// 6) Non-admins bounce to their portal; anonymous to login with next.
for (const [label, cookie] of [
  ["student", studentCookie],
  ["faculty", facultyCookie],
  ["security", securityCookie],
]) {
  const res = await get("/admin/users", cookie);
  assert(res.status === 307, `${label} admin users status`, res.status);
  assert(res.location.endsWith("/student"), `${label} admin users target`, res.location);
}

{
  const res = await get("/admin/users", null);
  assert(res.status === 307, "anonymous admin users status", res.status);
  assert(res.location.includes("/login?next="), "anonymous login target", res.location);
  assert(res.location.includes("%2Fadmin%2Fusers"), "anonymous next path", res.location);
}

console.log("T-12b UI smoke: PASS");
console.log("- admin list 200: seeded rows, create form (student shape), role filters");
console.log("- search by name filters server-side; role filter and invalid-role fallback work");
console.log("- student detail shows roll (no designation); admin detail shows designation (no roll)");
console.log("- malformed and unknown ids both 404");
console.log("- student/faculty/security -> /student; anonymous -> /login?next=%2Fadmin%2Fusers");
console.log("- nav links only built sections (no dead Rules/Analytics)");
