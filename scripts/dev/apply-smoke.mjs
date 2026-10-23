// T-06 evidence script — replicates the exact runtime path of the submission
// server action against the local stack: session-authed RPC (real JWT via
// password grant), service-role storage upload to the FINAL path, magic-byte
// util imported from the shipped code, and the no-client-credential invariant.
// Rows are left in place (audit/notifications are evidence; append-only anyway).
// Run: node --env-file=.env.local scripts/dev/apply-smoke.mjs
import { createClient } from "@supabase/supabase-js";
import { sniffDocumentMime } from "../../lib/documents/magic.ts";

const BUCKET = "medical-documents";
const DOC_LIMIT = 4 * 1024 * 1024;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const user = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

// Minimal, structurally valid document bytes (the sniffer only reads prefixes).
const PDF_STUB = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>>\nendobj\ntrailer <</Root 1 0 R/Size 2>>\n%%EOF\n",
);
const PNG_1PX = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
  0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
  0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78,
  0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const fail = (label, detail) => {
  console.error(`FAIL ${label}:`, detail ?? "");
  process.exit(1);
};

// 1. Magic-byte util behaves as the action expects (imported from shipped code).
if (sniffDocumentMime(PDF_STUB.slice(0, 8)) !== "application/pdf") {
  fail("sniff", "PDF stub must sniff as application/pdf");
}
if (sniffDocumentMime(PNG_1PX.slice(0, 8)) !== "image/png") {
  fail("sniff", "PNG stub must sniff as image/png");
}
const plainText = new TextEncoder().encode("this is definitely not a medical document");
if (sniffDocumentMime(plainText.slice(0, 8)) !== null) {
  fail("sniff", "plain text must not pass the boundary");
}
console.log("sniffer: pdf/png pass, plain text rejected");

// 2. Session: the real student identity (PostgREST derives auth.uid() from it).
const { data: signIn, error: signInError } = await user.auth.signInWithPassword({
  email: "aarav.demo@pratappass.test",
  password: "DemoPassw0rd!",
});
if (signInError || !signIn.session) fail("login", signInError?.message);

// 3. Upload to the FINAL path via the service-role client, exactly like the
//    server action ({application_id}/{uuid}.{ext} before the row exists).
const applicationId = crypto.randomUUID();
const docPath = `${applicationId}/${crypto.randomUUID()}.pdf`;
{
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(docPath, PDF_STUB, { contentType: "application/pdf", upsert: false });
  if (error) fail("upload(final path)", error.message);
}
console.log("service-role upload ok:", docPath);

// 4. Submit under the REAL session (not service role) — the intended PostgREST
//    surface of the SECURITY DEFINER function.
const iso = (hours) => new Date(Date.now() + hours * 3600_000).toISOString();
const { data: appRow, error: submitError } = await user.rpc("fn_submit_application", {
  p_reason: "medical",
  p_departure_at: iso(2),
  p_expected_return_at: iso(5),
  p_explanation: "Clinic follow-up after dental surgery (smoke script).",
  p_docs: [
    {
      storage_path: docPath,
      content_type: "application/pdf",
      byte_size: PDF_STUB.length,
      label: "Dental advisory (smoke)",
    },
  ],
  p_application_id: applicationId,
});
if (submitError) fail("fn_submit_application", submitError.message);
if (appRow.id !== applicationId) fail("explicit-id", `got ${appRow.id}, sent ${applicationId}`);
console.log("fn_submit_application ok:", appRow.id, appRow.status);

// 5. The student can read the app + its document metadata via RLS.
const { data: own, error: ownError } = await user
  .from("gate_pass_applications")
  .select("id, reason, status, medical_documents(storage_path, content_type, byte_size)")
  .eq("id", appRow.id)
  .maybeSingle();
if (ownError) fail("RLS read", ownError.message);
if (own?.medical_documents?.length !== 1 || own.medical_documents[0].storage_path !== docPath) {
  fail("doc row", JSON.stringify(own?.medical_documents ?? null));
}
console.log("student RLS read ok: app +", own.medical_documents.length, "document row(s)");

// 6. Both parties got their notifications (student confirmation, faculty review).
const { count: userNotes } = await user
  .from("notifications")
  .select("id", { count: "exact" })
  .eq("application_id", appRow.id);
const { count: allNotes } = await admin
  .from("notifications")
  .select("id", { count: "exact" })
  .eq("application_id", appRow.id);
if (!userNotes || !allNotes || userNotes === 0 || allNotes < 2) {
  fail("notifications", `student=${userNotes} total=${allNotes}`);
}
console.log(`notifications ok: student=${userNotes} total=${allNotes} (student + first-step scope)`);

// 7. No bucket write credential may exist for a browser session: the
//    authenticated client cannot mint a signed upload URL (default deny).
const { error: mintError } = await user.storage
  .from(BUCKET)
  .createSignedUploadUrl(`probe/${crypto.randomUUID()}.png`);
if (!mintError) fail("credential invariant", "authenticated client minted an upload URL!");
console.log("authenticated client denied upload URL:", mintError.message);

// 8. The bucket itself refuses what the app boundary refuses: > 4 MiB.
const oversized = new Uint8Array(DOC_LIMIT + 1024); // 1 KiB past the cap, zero-filled
{
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(`probe/${crypto.randomUUID()}.bin`, oversized, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (!error) fail("bucket size limit", "5 MiB upload was accepted!");
  console.log("bucket rejects > 4 MiB:", error.message);
}

console.log("apply smoke complete (rows left as evidence)");
