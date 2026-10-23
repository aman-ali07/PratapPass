// T-09 evidence script — decision authority exercised through REAL sessions:
// wrong-step and remarks negatives, the request_info→answer→approve leg, the
// faculty-stage REJECT that terminates the chain (HOD step never engages), and
// the final approve that fires the 0006 pass-issuance trigger (first runtime
// proof of a pass row). Fresh application C is left `submitted` so the UI curl
// evidence can render the decision panel on un-decided work.
// Run: node --env-file=.env.local scripts/dev/decision-smoke.mjs
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
const hod = createClient(
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
  const { error } = await client.auth.signInWithPassword({ email, password: "DemoPassw0rd!" });
  if (error) fail("login", `${email}: ${error.message}`);
}

/** Fresh CSE application with a real uploaded doc (final path, as T-06). */
async function seedApplication(explanation) {
  const applicationId = crypto.randomUUID();
  const docPath = `${applicationId}/${crypto.randomUUID()}.pdf`;
  {
    const { error } = await admin.storage
      .from("medical-documents")
      .upload(docPath, PDF_STUB, { contentType: "application/pdf", upsert: false });
    if (error) fail("storage upload", error.message);
  }
  const { error } = await student.rpc("fn_submit_application", {
    p_reason: "medical",
    p_departure_at: iso(5),
    p_expected_return_at: iso(9),
    p_explanation: explanation,
    p_docs: [{ storage_path: docPath, content_type: "application/pdf", byte_size: PDF_STUB.length, label: "Smoke doc" }],
    p_application_id: applicationId,
  });
  if (error) fail("fn_submit_application", error.message);
  return applicationId;
}

await signIn(student, "aarav.demo@pratappass.test");
await signIn(faculty, "faculty.demo@pratappass.test");
await signIn(hod, "hod.demo@pratappass.test");

// === A: happy chain to final approve → PASS ISSUED ==========================
const appA = await seedApplication("T-09 decision smoke A (full chain)");
{
  const { error } = await hod.rpc("fn_decide_application", {
    p_application_id: appA,
    p_action: "approve",
    p_remarks: null,
  });
  if (!error || error.message !== "You are not the assigned approver for the current step") {
    fail("wrong-step deny", error?.message ?? "HOD decided a step-1 faculty app!");
  }
  console.log("NEG hod-on-step1:", "You are not the assigned approver for the current step");
}
{
  const { error } = await faculty.rpc("fn_decide_application", {
    p_application_id: appA,
    p_action: "reject",
    p_remarks: null,
  });
  if (!error || error.message !== "Remarks are required when rejecting or requesting information") {
    fail("remarks required", error?.message ?? "reject without remarks accepted!");
  }
  console.log("NEG reject sans remarks:", "Remarks are required when rejecting or requesting information");
}
{
  const { error } = await faculty.rpc("fn_decide_application", {
    p_application_id: appA,
    p_action: "request_info",
    p_remarks: "Attach the prescription.",
  });
  if (error) fail("request_info", error.message);
  const { data, error: readError } = await student
    .from("gate_pass_applications")
    .select("status")
    .eq("id", appA)
    .single();
  if (readError || data.status !== "additional_info_required") fail("state", data?.status ?? readError?.message);
}
{
  const { error } = await faculty.rpc("fn_decide_application", {
    p_application_id: appA,
    p_action: "approve",
    p_remarks: null,
  });
  if (!error || !error.message.startsWith("This application is not awaiting a decision (")) {
    fail("stale decide", error?.message ?? "decided a paused app!");
  }
  console.log("NEG decide-while-paused:", error.message);
}
{
  const { error } = await student.rpc("fn_provide_info", {
    p_application_id: appA,
    p_text: "Prescription shared with the clinic portal.",
  });
  if (error) fail("fn_provide_info", error.message);
  console.log("student answered — chain resumed");
}
{
  const { error } = await faculty.rpc("fn_decide_application", {
    p_application_id: appA,
    p_action: "approve",
    p_remarks: null,
  });
  if (error) fail("faculty approve", error.message);
  const { data: hodNotes, error: notesError } = await hod
    .from("notifications")
    .select("type")
    .eq("application_id", appA);
  if (notesError) fail("hod notifications", notesError.message);
  if (!hodNotes.some((n) => n.type === "review_required")) {
    fail("hod notified", JSON.stringify(hodNotes.map((n) => n.type)));
  }
  console.log("faculty approve ok — hod notified (review_required)");
}
{
  const { error } = await hod.rpc("fn_decide_application", {
    p_application_id: appA,
    p_action: "approve",
    p_remarks: null,
  });
  if (error) fail("hod approve", error.message);

  const { data: appRow, error: appReadError } = await admin
    .from("gate_pass_applications")
    .select("status, decided_at")
    .eq("id", appA)
    .single();
  if (appReadError || appRow.status !== "approved") fail("final status", appRow?.status ?? appReadError?.message);

  const { data: pass, error: passError } = await admin
    .from("gate_passes")
    .select("id, token_hash, pass_code, valid_from, expires_at")
    .eq("application_id", appA)
    .single();
  if (passError || !pass) fail("pass issued", passError?.message ?? "no pass row");
  if (!/^[0-9a-f]{64}$/.test(pass.token_hash)) fail("token_hash", pass.token_hash);
  if (!/^MPGI-[0-9A-F]{6}$/.test(pass.pass_code ?? "")) fail("pass_code", pass.pass_code);
  if (!(new Date(pass.expires_at) > new Date(pass.valid_from))) fail("validity window", JSON.stringify(pass));
  console.log("final approve ok — pass issued:", pass.pass_code, "(token SHA-256, validity bounded)");

  const { count: issuedNotes } = await admin
    .from("notifications")
    .select("id", { count: "exact" })
    .eq("application_id", appA)
    .eq("type", "pass_issued");
  if (!issuedNotes) fail("pass_issued notification", "count=0");
  console.log("student notified: pass_issued");
}

// === B: faculty-stage REJECT ends the chain; HOD step never engages ==========
const appB = await seedApplication("T-09 decision smoke B (faculty-stage reject)");
{
  const { error } = await faculty.rpc("fn_decide_application", {
    p_application_id: appB,
    p_action: "reject",
    p_remarks: "Covers only non-emergency visits — denied per handbook.",
  });
  if (error) fail("faculty reject", error.message);
  const { data, error: readError } = await student
    .from("gate_pass_applications")
    .select("status, decided_at")
    .eq("id", appB)
    .single();
  if (readError || data.status !== "rejected") fail("reject status", data?.status ?? readError?.message);
  const { data: notes, error: notesError } = await student
    .from("notifications")
    .select("type, body")
    .eq("application_id", appB);
  if (notesError) fail("student notifications", notesError.message);
  if (!notes?.some((n) => n.type === "decision_made" && n.body.includes("handbook"))) {
    fail("student notified of remarks", JSON.stringify(notes?.map((n) => n.type) ?? []));
  }
}
{
  const { error } = await hod.rpc("fn_decide_application", {
    p_application_id: appB,
    p_action: "approve",
    p_remarks: null,
  });
  if (!error || error.message !== "This application is not awaiting a decision (rejected)") {
    fail("hod on rejected", error?.message ?? "HOD engaged a rejected app!");
  }
  console.log("NEG hod-on-rejected:", error.message);
}

// === C: left `submitted` for the UI panel evidence ===========================
const appC = await seedApplication("T-09 decision smoke C (left for UI panel)");
console.log("application C left submitted:", appC);

console.log("decision smoke complete (rows left as evidence)");
