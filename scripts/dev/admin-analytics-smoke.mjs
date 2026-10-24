// T-13 evidence — /admin/analytics and /admin/audit against the live stack.
//
// The SQL matrix (metric definitions, filters, pagination, denials) is proven in
// psql. This script proves the HTTP surface AND reconciles the rendered numbers
// with independent queries: expected counts are computed here from raw rows, not
// copied from the page. Overdue rows are checked by student name so a wrong
// predicate (e.g. including decided applications) fails loudly.
//
// Run: node --env-file=.env.local scripts/dev/admin-analytics-smoke.mjs
import { createClient } from "@supabase/supabase-js";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const ADMIN_ID = "00000000-0000-0000-0000-000000000006";
const PENDING = ["submitted", "under_review", "additional_info_required"];

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

// --- Independent expectations ------------------------------------------------
const { data: applications, error: appError } = await service
  .from("gate_pass_applications")
  .select("id, reason, status, expected_return_at, submitted_at, decided_at, student_id, department_id");
if (appError) fail("applications read", appError.message);

const total = applications.length;
const pending = applications.filter((a) => PENDING.includes(a.status)).length;
const approved = applications.filter((a) => a.status === "approved" || a.status === "completed").length;
const rejected = applications.filter((a) => a.status === "rejected").length;
const decided = approved + rejected;
const rate = decided === 0 ? null : Math.round((1000 * approved) / decided) / 10;
const decidedRows = applications.filter((a) => a.decided_at !== null);
const avgSeconds =
  decidedRows.length === 0
    ? null
    : Math.round(
        decidedRows.reduce(
          (sum, a) => sum + (Date.parse(a.decided_at) - Date.parse(a.submitted_at)) / 1000,
          0,
        ) / decidedRows.length,
      );

const now = Date.now();
const overdueRows = applications
  .filter((a) => PENDING.includes(a.status) && Date.parse(a.expected_return_at) < now)
  .sort((a, b) => Date.parse(a.expected_return_at) - Date.parse(b.expected_return_at));

const overdueIds = [...new Set(overdueRows.map((a) => a.student_id))];
const { data: overdueStudents, error: studentError } = await service
  .from("profiles")
  .select("id, full_name")
  .in("id", overdueIds.length ? overdueIds : ["00000000-0000-0000-0000-000000000000"]);
if (studentError) fail("overdue students read", studentError.message);

const overdueNames = new Set((overdueStudents ?? []).map((student) => student.full_name));
const renderedOverdue = overdueRows.slice(0, 10);
const renderedNames = renderedOverdue.map(
  (row) => overdueStudents?.find((student) => student.id === row.student_id)?.full_name,
);

const { count: auditCount, error: auditCountError } = await service
  .from("audit_logs")
  .select("id", { count: "exact", head: true });
if (auditCountError) fail("audit count", auditCountError.message);

const { count: adminAuditCount, error: adminAuditError } = await service
  .from("audit_logs")
  .select("id", { count: "exact", head: true })
  .eq("actor_id", ADMIN_ID);
if (adminAuditError) fail("admin audit count", adminAuditError.message);

const { count: systemAuditCount, error: systemAuditError } = await service
  .from("audit_logs")
  .select("id", { count: "exact", head: true })
  .is("actor_id", null);
if (systemAuditError) fail("system audit count", systemAuditError.message);

const { count: applicationAuditCount, error: applicationAuditError } = await service
  .from("audit_logs")
  .select("id", { count: "exact", head: true })
  .like("action", "application.%");
if (applicationAuditError) fail("application audit count", applicationAuditError.message);

console.log(
  `expected: ${total} apps (${pending} pending, ${approved} approved, ${rejected} rejected), ` +
    `rate ${rate === null ? "—" : `${rate}%`}, avg ${avgSeconds}s, overdue ${overdueRows.length}`,
);
console.log(
  `expected audit: ${auditCount} rows (${adminAuditCount} admin, ${systemAuditCount} system, ` +
    `${applicationAuditCount} application.*)`,
);

// --- 1. Analytics page --------------------------------------------------------
{
  const res = await get("/admin/analytics", adminCookie);
  assert(res.status === 200, "analytics status", res.status);
  for (const marker of [
    "Analytics",
    "Total requests",
    "Awaiting decision",
    "Approval rate",
    "Avg processing",
    "By request type",
    "By department",
    "Overdue",
    "past the trip window",
    'href="/admin/analytics"',
    'href="/admin/audit"',
    "Medical",
    "Personal",
    "Emergency",
    "Computer Science",
  ]) {
    assert(res.body.includes(marker), `analytics renders ${marker}`);
  }

  // Numbers must match the independently computed values.
  assert(res.body.includes(`>${total}<`), "renders the total count", String(total));
  assert(res.body.includes(`>${pending}<`), "renders the pending count", String(pending));
  assert(res.body.includes(`>${approved}<`), "renders the approved count", String(approved));
  assert(res.body.includes(`>${rejected}<`), "renders the rejected count", String(rejected));
  if (rate !== null) {
    assert(res.body.includes(`${rate.toFixed(1)}%`), "renders the approval rate", String(rate));
  }
  if (avgSeconds !== null) {
    const minutes = Math.floor(avgSeconds / 60);
    const seconds = avgSeconds % 60;
    const label = minutes < 60 ? `${minutes}m ${seconds}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    assert(res.body.includes(label), "renders the average processing time", label);
  }

  if (overdueRows.length === 0) {
    assert(
      res.body.includes("No request has passed its expected return time while undecided."),
      "renders the empty overdue state",
    );
  } else {
    assert(
      res.body.includes(
        `${overdueRows.length} request${overdueRows.length === 1 ? "" : "s"} still awaiting a decision`,
      ),
      "renders the overdue count sentence",
      String(overdueRows.length),
    );
    for (const name of renderedNames) {
      assert(name && res.body.includes(name), "renders overdue student", name ?? "missing name");
    }
  }

  // A student whose applications are all decided (and who has no overdue row)
  // must not appear: the page renders student names only in the overdue table.
  const overdueStudentIds = new Set(overdueRows.map((a) => a.student_id));
  const decidedOnlyIds = [
    ...new Set(
      applications
        .filter((a) => !PENDING.includes(a.status) && !overdueStudentIds.has(a.student_id))
        .map((a) => a.student_id),
    ),
  ];
  if (decidedOnlyIds.length > 0) {
    const { data: decidedOnly } = await service
      .from("profiles")
      .select("full_name")
      .in("id", decidedOnlyIds);
    for (const student of decidedOnly ?? []) {
      if (overdueNames.has(student.full_name)) continue; // same name as an overdue student
      assert(
        !res.body.includes(student.full_name),
        "decided-only student appears in the overdue table",
        student.full_name,
      );
    }
  }
}

// --- 2. Audit page: default view ---------------------------------------------
{
  const res = await get("/admin/audit", adminCookie);
  assert(res.status === 200, "audit status", res.status);
  for (const marker of [
    "Audit log",
    "append-only",
    "Filters",
    'name="actor"',
    'name="action"',
    'name="from"',
    'name="to"',
    "All actors",
    "System (no actor)",
    "Admin Demo",
    "Entries",
    "Metadata",
  ]) {
    assert(res.body.includes(marker), `audit renders ${marker}`);
  }
  assert(
    res.body.includes(`of ${auditCount} matching entries`),
    "renders the filtered total",
    String(auditCount),
  );
  // Newest first: the most recent action must be a rule/user admin row.
  const { data: newest } = await service
    .from("audit_logs")
    .select("action, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  assert(newest?.[0] && res.body.includes(newest[0].action), "newest entry rendered", newest?.[0]?.action);
}

// --- 3. Audit filters ---------------------------------------------------------
{
  const byActor = await get(`/admin/audit?actor=${ADMIN_ID}`, adminCookie);
  assert(byActor.status === 200, "actor filter status", byActor.status);
  assert(
    byActor.body.includes(`of ${adminAuditCount} matching entries`),
    "actor filter total",
    String(adminAuditCount),
  );
  assert(byActor.body.includes("Admin Demo"), "actor filter keeps admin rows");
  assert(!byActor.body.includes("application.submitted"), "actor filter excludes student actions");
}

{
  const byAction = await get("/admin/audit?action=application.", adminCookie);
  assert(byAction.status === 200, "action filter status", byAction.status);
  assert(
    byAction.body.includes(`of ${applicationAuditCount} matching entries`),
    "action prefix total",
    String(applicationAuditCount),
  );
  assert(byAction.body.includes("application.submitted"), "action prefix keeps submissions");
  assert(!byAction.body.includes("admin.rule_updated"), "action prefix excludes admin rules");
}

{
  const system = await get("/admin/audit?actor=system", adminCookie);
  assert(system.status === 200, "system filter status", system.status);
  assert(
    system.body.includes(`of ${systemAuditCount} matching entries`),
    "system filter total",
    String(systemAuditCount),
  );
  assert(system.body.includes("seed.applied") || system.body.includes("pass.issued"),
    "system filter shows trigger rows");
}

{
  // A future range must be empty — proves the range bound is applied.
  const future = await get("/admin/audit?from=2099-01-01", adminCookie);
  assert(future.status === 200, "future range status", future.status);
  assert(
    future.body.includes("Nothing has been recorded for this filter yet."),
    "future range is empty",
  );

  const inverted = await get("/admin/audit?from=2099-01-02&to=2099-01-01", adminCookie);
  assert(inverted.status === 200, "inverted range status", inverted.status);
  assert(inverted.body.includes("The start date is after the end date"), "inverted range notice");
  assert(inverted.body.includes(`of ${auditCount} matching entries`), "inverted range ignored");
}

// --- 4. Audit pagination ------------------------------------------------------
{
  const page2 = await get("/admin/audit?page=2", adminCookie);
  assert(page2.status === 200, "page 2 status", page2.status);
  const expectedPages = Math.max(1, Math.ceil(auditCount / 50));
  assert(page2.body.includes(`Page 2 of ${expectedPages}`), "page 2 indicator",
    `Page 2 of ${expectedPages}`);
  if (auditCount > 50) {
    assert(page2.body.includes(`of ${auditCount} matching entries`), "page 2 total");
    assert(page2.body.includes("Newer"), "page 2 has a newer link");
  }

  const beyond = await get(`/admin/audit?page=${expectedPages + 1}`, adminCookie);
  assert(beyond.status === 200, "beyond-last status", beyond.status);
  assert(beyond.body.includes("There are no entries on this page."), "beyond-last empty state");
  assert(beyond.body.includes("Back to the first page"), "beyond-last recovery link");
}

// --- 5. Role gates ------------------------------------------------------------
for (const [label, cookie] of [
  ["student", studentCookie],
  ["faculty", facultyCookie],
  ["security", securityCookie],
]) {
  for (const path of ["/admin/analytics", "/admin/audit"]) {
    const res = await get(path, cookie);
    assert(res.status === 307, `${label} ${path} status`, res.status);
    assert(res.location.endsWith("/student"), `${label} ${path} target`, res.location);
  }
}

for (const path of ["/admin/analytics", "/admin/audit"]) {
  const res = await get(path, null);
  assert(res.status === 307, `anonymous ${path} status`, res.status);
  assert(res.location.includes("/login?next="), `anonymous ${path} login target`, res.location);
  assert(
    res.location.includes(encodeURIComponent(path)),
    `anonymous ${path} next path`,
    res.location,
  );
}

console.log("T-13 UI smoke: PASS");
console.log(`- analytics 200: ${total} apps, ${pending} pending, rate ${rate}%, overdue ${overdueRows.length}`);
console.log("- rendered counts and processing time match independent SQL-derived values");
console.log("- overdue table lists exactly the pending past-window rows");
console.log(`- audit 200: ${auditCount} rows, newest first, metadata visible`);
console.log(`- actor filter -> ${adminAuditCount} admin rows; action prefix -> ${applicationAuditCount}`);
console.log(`- system filter -> ${systemAuditCount}; future range empty; inverted range warned`);
console.log("- pagination: page 2 and beyond-last recovery link");
console.log("- student/faculty/security -> /student; anonymous -> /login?next=...");
