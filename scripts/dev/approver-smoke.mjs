// T-08 evidence script — the reviewer side end-to-end against the local stack:
// a fresh medical application lands in the CSE faculty queue (name/roll visible
// via 0009), audited ≤5-min previews open for in-department approvers, and a
// cross-department faculty identity gets the same 404 an unknown id gets (no
// existence oracle). Rows stay (audit is evidence).
// Run: node --env-file=.env.local scripts/dev/approver-smoke.mjs
import { createClient } from "@supabase/supabase-js";

const SITE = process.env.DEV_SITE_URL ?? "http://localhost:3000";
const BUCKET = "medical-documents";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const student = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const faculty = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const hod = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const outsider = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const PDF_STUB = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>>\nendobj\ntrailer <</Root 1 0 R/Size 2>>\n%%EOF\n",
);

const fail = (label, detail) => {
  console.error(`FAIL ${label}:`, detail ?? "");
  process.exit(1);
};
const iso = (hours) => new Date(Date.now() + hours * 3600_000).toISOString();

async function signIn(client, email) {
  const { data, error } = await client.auth.signInWithPassword({ email, password: "DemoPassw0rd!" });
  if (error || !data?.session) fail("login", `${email}: ${error?.message}`);
  return data.session;
}

/** The SSR cookie the app stores — same trick as the T-06/T-07 cookie curl. */
async function authCookie(client, email) {
  const session = await signIn(client, email);
  const b64 = "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return "sb-127-auth-token=" + b64;
}

// 1. Provision a cross-department (ECE) faculty identity for the scope negative.
//    service-role auth admin + the profile trigger → then role/dept upgrade.
const OUTSIDER_EMAIL = "ece.faculty.demo@pratappass.test";
{
  const { data: existing } = await admin
    .from("profiles")
    .select("id, role")
    .eq("full_name", "ECE Demo Faculty")
    .maybeSingle();
  if (!existing) {
    const { error: createError } = await admin.auth.admin.createUser({
      email: OUTSIDER_EMAIL,
      password: "DemoPassw0rd!",
      email_confirm: true,
      user_metadata: { full_name: "ECE Demo Faculty" },
    });
    if (createError) fail("provision outsider", createError.message);
  }
  const { error: promoteError } = await admin
    .from("profiles")
    .update({ role: "faculty", department_id: "00000000-0000-0000-0000-000000000102" })
    .eq("full_name", "ECE Demo Faculty");
  if (promoteError) fail("promote outsider", promoteError.message);
}

// 2. Fresh CSE application (student session + final-path upload, as T-06).
await signIn(student, "aarav.demo@pratappass.test");
await signIn(faculty, "faculty.demo@pratappass.test");
await signIn(hod, "hod.demo@pratappass.test");

const applicationId = crypto.randomUUID();
const docPath = `${applicationId}/${crypto.randomUUID()}.pdf`;
{
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(docPath, PDF_STUB, { contentType: "application/pdf", upsert: false });
  if (error) fail("storage upload", error.message);
}
{
  const { error } = await student.rpc("fn_submit_application", {
    p_reason: "medical",
    p_departure_at: iso(4),
    p_expected_return_at: iso(7),
    p_explanation: "T-08 approver-scope smoke application",
    p_docs: [{ storage_path: docPath, content_type: "application/pdf", byte_size: PDF_STUB.length, label: "Smoke doc" }],
    p_application_id: applicationId,
  });
  if (error) fail("fn_submit_application", error.message);
}
console.log("fresh application:", applicationId);

// 3. Faculty reads the document id via RLS (department-scope docs policy).
const { data: docRow, error: docReadError } = await faculty
  .from("medical_documents")
  .select("id, label")
  .eq("application_id", applicationId)
  .maybeSingle();
if (docReadError) fail("faculty RLS doc read", docReadError.message);
if (!docRow) fail("faculty RLS doc read", "application doc invisible to in-dept faculty");
const docId = docRow.id;
console.log("faculty RLS doc read ok:", docRow.label);

// 4. Audited previews for both in-dept approvers, then the audit count MUST
//    equal the number of issued URLs.
{ const cookie = await authCookie(faculty, "faculty.demo@pratappass.test");
  const res = await fetch(`${SITE}/api/documents/${docId}`, { headers: { Cookie: cookie }, redirect: "manual" });
  if (res.status !== 307) fail("faculty preview", `status ${res.status} ${await res.text()}`);
  const signedUrl = res.headers.get("location");
  if (!signedUrl || !signedUrl.includes("/object/sign/")) fail("signed url", signedUrl);
  const pdf = await fetch(signedUrl);
  if (!pdf.ok) fail("signed url fetch", `${pdf.status}`);
  const body = await pdf.arrayBuffer();
  if (body.byteLength !== PDF_STUB.length) fail("signed url bytes", String(body.byteLength));
  console.log("faculty preview: 307 ->", pdf.status, "pdf", body.byteLength, "bytes");
}
{ const cookie = await authCookie(hod, "hod.demo@pratappass.test");
  const res = await fetch(`${SITE}/api/documents/${docId}`, { headers: { Cookie: cookie }, redirect: "manual" });
  if (res.status !== 307) fail("hod preview", `status ${res.status}`);
  console.log("hod preview: 307 ok");
}

const { count: auditRows, error: auditError } = await admin
  .from("audit_logs")
  .select("id", { count: "exact" })
  .eq("action", "document.signed_url_issued")
  .eq("entity_id", docId);
if (auditError) fail("audit read", auditError.message);
if (auditRows !== 2) fail("audit rows", `expected 2 (one per issued URL), got ${auditRows}`);
console.log("audit rows for issued URLs:", auditRows, "(faculty + hod)");

// 5. Existence-oracle negative: outsider faculty and a random uuid look the
//    same to the client (404), and NO audit row was appended for the denial.
{ const cookie = await authCookie(outsider, OUTSIDER_EMAIL);
  const probed = await fetch(`${SITE}/api/documents/${docId}`, { headers: { Cookie: cookie }, redirect: "manual" });
  if (probed.status !== 404) fail("outsider probe", `status ${probed.status} ${await probed.text()}`);
  console.log("cross-dept preview ->", probed.status, "(404, same as unknown id)");
}
{
  const randomId = crypto.randomUUID();
  const cookie = await authCookie(faculty, "faculty.demo@pratappass.test");
  const res = await fetch(`${SITE}/api/documents/${randomId}`, { headers: { Cookie: cookie }, redirect: "manual" });
  if (res.status !== 404) fail("unknown id", `status ${res.status}`);
  console.log("unknown uuid (authenticated) ->", res.status);
}
{
  const randomId = crypto.randomUUID();
  const res = await fetch(`${SITE}/api/documents/${randomId}`, { redirect: "manual" });
  if (res.status !== 401) fail("anonymous probe", `status ${res.status}`);
  console.log("anonymous uuid ->", res.status, "(unauthenticated envelope)");
}
const { count: auditAfterNegatives } = await admin
  .from("audit_logs")
  .select("id", { count: "exact" })
  .eq("action", "document.signed_url_issued")
  .eq("entity_id", docId);
if (auditAfterNegatives !== 2) fail("audit unchanged", `got ${auditAfterNegatives}`);
console.log("denials appended no audit rows:", auditAfterNegatives);

console.log("approver smoke complete (rows left as evidence)");
