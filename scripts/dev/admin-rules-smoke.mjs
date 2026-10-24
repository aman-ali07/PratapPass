// T-12c evidence — /admin/rules role gates, the rules matrix, and form shapes.
//
// The database contract (create/update/delete guards, emergency immutability,
// global-delete refusal, audit rows, fresh-submission chain) is proven in psql
// against 0015. This script proves the HTTP surface: admin 200 with the real
// matrix (global defaults + CSE override + the added `other` default), detail
// pages with the correct delete affordance, malformed/unknown ids 404, and the
// non-admin/anon gates.
//
// The form POST is not browser-driven (same honest limit as T-11/T-12a/T-12b);
// the actions are typechecked and call the psql-proven functions.
//
// Run: node --env-file=.env.local scripts/dev/admin-rules-smoke.mjs
import { createClient } from "@supabase/supabase-js";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const CSE_ID = "00000000-0000-0000-0000-000000000101";
const UNKNOWN_ID = "11111111-1111-1111-1111-111111111111";

const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
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

// Rule ids for the detail-page checks (read-only service query; the page itself
// reads through the admin RPC).
const { data: rules, error: rulesError } = await service
  .from("approval_rules")
  .select("id, department_id, reason");
if (rulesError) fail("rule lookup", rulesError.message);

const globalPersonal = rules.find((r) => r.department_id === null && r.reason === "personal");
const csePersonal = rules.find((r) => r.department_id === CSE_ID && r.reason === "personal");
const otherGlobal = rules.find((r) => r.department_id === null && r.reason === "other");
assert(globalPersonal, "global personal rule missing");
assert(csePersonal, "CSE personal override missing");
assert(otherGlobal, "global other default missing (0015 baseline)");

// 1) Admin index still lands on the first built section.
{
  const res = await get("/admin", adminCookie);
  assert(res.status === 307, "admin /admin status", res.status);
  assert(res.location.includes("/admin/departments"), "admin /admin target", res.location);
}

// 2) Rules matrix renders globals, the CSE override, and the create form.
{
  const res = await get("/admin/rules", adminCookie);
  assert(res.status === 200, "admin rules status", res.status);
  for (const marker of [
    "Approval rules",
    "Global defaults",
    "Department overrides",
    "Add a department override",
    "Medical",
    "Personal",
    "Emergency",
    "Other",
    "Faculty → HOD",
    "HOD only",
    "Required",
    "Not required",
    "12 h",
    "CSE",
    "Every request type falls back to these",
    "Emergency is fixed to a single HOD step",
    'href="/admin/rules"',
    'name="departmentId"',
    'name="reason"',
    'name="chain"',
    'name="requiresMedicalDocument"',
    'name="passValidityHours"',
    'type="number"',
  ]) {
    assert(res.body.includes(marker), `rules page renders ${marker}`);
  }
  assert(!res.body.includes('href="/admin/analytics"'), "no dead Analytics link");
  assert(!res.body.includes('href="/admin/audit"'), "no dead Audit link");
}

// 3) Global detail: editable, explicitly not deletable.
{
  const res = await get(`/admin/rules/${globalPersonal.id}`, adminCookie);
  assert(res.status === 200, "global rule detail status", res.status);
  for (const marker of [
    "Global default",
    "cannot be deleted",
    "Edit rule",
    'name="passValidityHours"',
    'name="chain"',
  ]) {
    assert(res.body.includes(marker), `global detail renders ${marker}`);
  }
  assert(!res.body.includes("Delete department override"), "global detail has no delete card");
}

// 4) Override detail: shows scope and the delete affordance.
{
  const res = await get(`/admin/rules/${csePersonal.id}`, adminCookie);
  assert(res.status === 200, "override detail status", res.status);
  for (const marker of [
    "Computer Science &amp; Engineering (CSE)",
    "Delete department override",
    "Delete Personal (CSE)",
    "reverts",
  ]) {
    assert(res.body.includes(marker), `override detail renders ${marker}`);
  }
}

// 5) Malformed and unknown ids are indistinguishable 404s.
{
  const malformed = await get("/admin/rules/not-a-uuid", adminCookie);
  const unknown = await get(`/admin/rules/${UNKNOWN_ID}`, adminCookie);
  assert(malformed.status === 404, "malformed rule id 404", malformed.status);
  assert(unknown.status === 404, "unknown rule id 404", unknown.status);
}

// 6) Non-admins bounce to their portal; anonymous to login with next.
for (const [label, cookie] of [
  ["student", studentCookie],
  ["faculty", facultyCookie],
  ["security", securityCookie],
]) {
  const res = await get("/admin/rules", cookie);
  assert(res.status === 307, `${label} admin rules status`, res.status);
  assert(res.location.endsWith("/student"), `${label} admin rules target`, res.location);
}

{
  const res = await get("/admin/rules", null);
  assert(res.status === 307, "anonymous admin rules status", res.status);
  assert(res.location.includes("/login?next="), "anonymous login target", res.location);
  assert(res.location.includes("%2Fadmin%2Frules"), "anonymous next path", res.location);
}

console.log("T-12c UI smoke: PASS");
console.log("- admin rules 200: 4 global defaults + CSE override + create form");
console.log("- global detail editable with an explicit no-delete note");
console.log("- override detail shows scope and the delete affordance");
console.log("- malformed and unknown ids both 404");
console.log("- student/faculty/security -> /student; anonymous -> /login?next=%2Fadmin%2Frules");
console.log("- nav lists only built sections (no dead Analytics/Audit)");
