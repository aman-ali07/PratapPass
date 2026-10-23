import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SECURITY.md §3: previews are ≤5-minute links — the browser never holds a stable one. */
const PREVIEW_TTL_SECONDS = 300;

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Audited preview of an uploaded medical document (API.md §3): validates the
 * scope EXPLICITLY here (the route is the boundary — RLS behavior is never
 * trusted as a side effect for a 307 to sensitive bytes), appends the
 * append-only audit row, then 307s to the short-lived signed URL minted by the
 * service-role client. Unknown/out-of-scope reads are 404/403 without leaking
 * existence in the message.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return jsonError(404, "not_found", "Document not found");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError(401, "unauthenticated", "Sign in required");
  }

  // Scope facts: the viewer's role + the document's owning application. Both
  // reads use the service-role client so this file alone answers "who may open
  // what" — independent of policy evolution in SQL.
  const admin = createSupabaseAdminClient();
  const { error: docError, data: doc } = await admin
    .from("medical_documents")
    .select("id, storage_path, application_id, application:gate_pass_applications(department_id, student_id)")
    .eq("id", id)
    .maybeSingle();
  if (docError) {
    console.error("document lookup failed:", docError.message, docError.code);
    return jsonError(500, "internal_error", "Preview could not be issued");
  }
  if (!doc?.application) {
    return jsonError(404, "not_found", "Document not found");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, department_id")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role;
  const scopeOk =
    role === "admin" ||
    (role === "student" && doc.application.student_id === user.id) ||
    ((role === "faculty" || role === "hod") &&
      profile?.department_id === doc.application.department_id);
  if (!scopeOk) {
    // Same response as an unknown id: a permission-denied would CONFIRM that a
    // document exists at this address, leaking ids as an oracle (SECURITY.md
    // anti-enumeration posture; the acceptance criterion allows 403/404 — 404
    // is the stronger guarantee).
    return jsonError(404, "not_found", "Document not found");
  }

  const { data: signed, error: signError } = await admin.storage
    .from("medical-documents")
    .createSignedUrl(doc.storage_path, PREVIEW_TTL_SECONDS);
  if (signError || !signed) {
    // The storage error text may carry object internals — log server-side only.
    console.error("document signing failed:", signError?.message);
    return jsonError(500, "internal_error", "Preview could not be issued");
  }

  // No redirect without an audit row: a logging failure must NOT hand out the
  // URL, so the insert error fails closed.
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "document.signed_url_issued",
    entity_type: "medical_documents",
    entity_id: doc.id,
    metadata: { application_id: doc.application_id, ttl_seconds: PREVIEW_TTL_SECONDS },
  });
  if (auditError) {
    console.error("document audit append failed:", auditError.message, auditError.code);
    return jsonError(500, "internal_error", "Preview could not be issued");
  }

  return NextResponse.redirect(signed.signedUrl, 307);
}
