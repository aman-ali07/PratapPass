// T-12a evidence — /admin/departments role gates and rendering.
//
// Mutations are proven in psql against 0012 (create/update/delete, audit rows,
// last-admin-independent role denials, referenced-delete refusal). This script
// proves the HTTP surface: admin 200 with real seeded rows, non-admin 307 to
// their portal, anonymous 307 to login, malformed/unknown ids 404, and no
// links to admin sections that do not exist yet.
//
// The server-action form POST is not browser-driven here (same honest limit as
// T-11): the actions are typechecked and call the psql-proven functions.
//
// Run: node --env-file=.env.local scripts/dev/admin-departments-smoke.mjs
import { createClient } from "@supabase/supabase-js";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const CSE_ID = "00000000-0000-0000-0000-000000000101";
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
  return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text() };
}

const adminCookie = authCookie(await signIn("admin.demo@pratappass.test"));
const studentCookie = authCookie(await signIn("aarav.demo@pratappass.test"));
const facultyCookie = authCookie(await signIn("faculty.demo@pratappass.test"));
const securityCookie = authCookie(await signIn("security.demo@pratappass.test"));

// 1) Admin index redirects into the only built section.
{
  const res = await get("/admin", adminCookie);
  assert(res.status === 307, "admin /admin status", res.status);
  assert(res.location.includes("/admin/departments"), "admin /admin target", res.location);
}

// 2) List renders the seeded departments and the create form.
{
  const res = await get("/admin/departments", adminCookie);
  assert(res.status === 200, "admin list status", res.status);
  for (const marker of [
    "Add a department",
    "All departments",
    "Computer Science &amp; Engineering",
    "CSE",
    "Electronics &amp; Communication",
    "Mechanical Engineering",
    "Edit",
  ]) {
    assert(res.body.includes(marker), `admin list renders ${marker}`);
  }
  assert(!res.body.includes("/admin/users"), "no dead Users link");
  assert(!res.body.includes("/admin/rules"), "no dead Rules link");
}

// 3) Detail renders edit + guarded delete.
{
  const res = await get(`/admin/departments/${CSE_ID}`, adminCookie);
  assert(res.status === 200, "admin detail status", res.status);
  for (const marker of [
    "Edit department",
    "Delete department",
    "Computer Science &amp; Engineering",
    "Reassign people and remove configuration first",
  ]) {
    assert(res.body.includes(marker), `admin detail renders ${marker}`);
  }
}

// 4) Malformed and unknown ids are indistinguishable 404s.
{
  const malformed = await get("/admin/departments/not-a-uuid", adminCookie);
  const unknown = await get(`/admin/departments/${UNKNOWN_ID}`, adminCookie);
  assert(malformed.status === 404, "malformed id 404", malformed.status);
  assert(unknown.status === 404, "unknown id 404", unknown.status);
}

// 5) Non-admins are bounced to their portal; anonymous to login with next.
for (const [label, cookie] of [
  ["student", studentCookie],
  ["faculty", facultyCookie],
  ["security", securityCookie],
]) {
  const res = await get("/admin/departments", cookie);
  assert(res.status === 307, `${label} admin status`, res.status);
  assert(res.location.endsWith("/student"), `${label} admin target`, res.location);
}

{
  const res = await get("/admin/departments", null);
  assert(res.status === 307, "anonymous admin status", res.status);
  assert(res.location.includes("/login?next="), "anonymous login target", res.location);
  assert(
    res.location.includes("%2Fadmin%2Fdepartments"),
    "anonymous next path",
    res.location,
  );
}

console.log("T-12a UI smoke: PASS");
console.log("- admin /admin -> /admin/departments (307)");
console.log("- admin list 200: seeded departments, create form, no dead nav links");
console.log("- admin detail 200: edit + delete surfaces");
console.log("- malformed and unknown ids both 404");
console.log("- student/faculty/security -> /student; anonymous -> /login?next=...");
