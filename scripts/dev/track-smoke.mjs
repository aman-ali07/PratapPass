// T-07 evidence script — the notification-driven round trip across TWO real
// identities: faculty requests info (`fn_decide_application`), the student
// answers (`fn_provide_info`), and both sides' state + notifications are read
// back under their own sessions. Rows stay (append-only audit is evidence).
// Run: node --env-file=.env.local scripts/dev/track-smoke.mjs
import { createClient } from "@supabase/supabase-js";

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

const fail = (label, detail) => {
  console.error(`FAIL ${label}:`, detail ?? "");
  process.exit(1);
};

const iso = (hours) => new Date(Date.now() + hours * 3600_000).toISOString();

async function signIn(client, email) {
  const { data, error } = await client.auth.signInWithPassword({ email, password: "DemoPassw0rd!" });
  if (error || !data?.session) fail("login", `${email}: ${error?.message}`);
  return data.user.id;
}

// Sessions on the anon clients are what matter; the returned ids are derived
// inside PostgREST (`auth.uid()`), so the script never needs them itself.
await signIn(student, "aarav.demo@pratappass.test");
await signIn(faculty, "faculty.demo@pratappass.test");

// 1. Seed a fresh application (real uploaded doc → final path, like T-06).
const PDF_STUB = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>>\nendobj\ntrailer <</Root 1 0 R/Size 2>>\n%%EOF\n",
);
const applicationId = crypto.randomUUID();
const docPath = `${applicationId}/${crypto.randomUUID()}.pdf`;
{
  const { error } = await admin.storage
    .from("medical-documents")
    .upload(docPath, PDF_STUB, { contentType: "application/pdf", upsert: false });
  if (error) fail("storage upload", error.message);
}
{
  const { data, error } = await student.rpc("fn_submit_application", {
    p_reason: "medical",
    p_departure_at: iso(3),
    p_expected_return_at: iso(6),
    p_explanation: "T-07 tracking-flow smoke application",
    p_docs: [{ storage_path: docPath, content_type: "application/pdf", byte_size: PDF_STUB.length, label: "Smoke doc" }],
    p_application_id: applicationId,
  });
  if (error) fail("fn_submit_application", error.message);
  console.log("fresh application:", data.id, data.status);
}

// 2. Faculty requests info (real faculty session — department scope check inside).
{
  const { error } = await faculty.rpc("fn_decide_application", {
    p_application_id: applicationId,
    p_action: "request_info",
    p_remarks: "Please attach the clinic prescription.",
  });
  if (error) fail("fn_decide_application(request_info)", error.message);
}

// 3. Student-side reads after the event (RLS own rows only).
const { data: appAfterRequest, error: read1Error } = await student
  .from("gate_pass_applications")
  .select("status, approval_steps(step_order, status)")
  .eq("id", applicationId)
  .single();
if (read1Error) fail("student read (post-request)", read1Error.message);
const step1AfterRequest = appAfterRequest.approval_steps.find((s) => s.step_order === 1);
if (appAfterRequest.status !== "additional_info_required" || step1AfterRequest?.status !== "info_requested") {
  fail("state after request_info", JSON.stringify(appAfterRequest));
}
console.log(
  "faculty request visible to student: status=%s step1=%s",
  appAfterRequest.status,
  step1AfterRequest.status,
);

const { count: infoReqNotes } = await student
  .from("notifications")
  .select("id", { count: "exact" })
  .eq("application_id", applicationId)
  .eq("type", "info_requested");
if (!infoReqNotes) fail("student notification (info_requested)", "count=0");
console.log("student notified: info_requested notifications =", infoReqNotes);

// 4. Student answers through the workflow function (still student session).
{
  const { error } = await student.rpc("fn_provide_info", {
    p_application_id: applicationId,
    p_text: "Prescription uploaded to the clinic portal; visiting orthopedic OPD at 3 PM.",
  });
  if (error) fail("fn_provide_info", error.message);
}

const { data: appAfterAnswer, error: read2Error } = await student
  .from("gate_pass_applications")
  .select("status, additional_info, approval_steps(step_order, status)")
  .eq("id", applicationId)
  .single();
if (read2Error) fail("student read (post-answer)", read2Error.message);
const step1AfterAnswer = appAfterAnswer.approval_steps.find((s) => s.step_order === 1);
if (
  appAfterAnswer.status !== "under_review" ||
  step1AfterAnswer?.status !== "pending" ||
  !appAfterAnswer.additional_info
) {
  fail("state after answer", JSON.stringify(appAfterAnswer));
}
console.log(
  "student answer resumed chain: status=%s step1=%s",
  appAfterAnswer.status,
  step1AfterAnswer.status,
);

// 5. The approver side received the notification (faculty session read).
const { data: facultyNotes, error: notesError } = await faculty
  .from("notifications")
  .select("type, application_id")
  .eq("application_id", applicationId);
if (notesError) fail("faculty notifications", notesError.message);
if (!facultyNotes.some((n) => n.type === "review_required" || n.type === "info_received")) {
  fail("faculty notification", JSON.stringify(facultyNotes));
}
console.log("faculty inbox contains:", facultyNotes.map((n) => n.type).join(", "));

// 6. Negative: a student cannot decide (workflow authority stays with staff).
{
  const { error } = await student.rpc("fn_decide_application", {
    p_application_id: applicationId,
    p_action: "approve",
    p_remarks: null,
  });
  if (!error) fail("role authority", "student decided an application!");
  if (error.message !== "Only faculty or HOD members may decide applications") {
    fail("role authority message", error.message);
  }
  console.log("student decision attempt denied:", error.message);
}

console.log("track smoke complete (two identities, rows left as evidence)");
