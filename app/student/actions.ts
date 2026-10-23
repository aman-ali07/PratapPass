"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { type ApplicationActionState } from "@/lib/application/form-state";
import { DOCUMENT_EXTENSIONS, sniffDocumentMime } from "@/lib/documents/magic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrorsFrom } from "@/lib/validation/field-errors";
import { applicationSchema, documentFileSchema } from "@/lib/validation/application";
/**
 * DB-function (P0001) messages that are already user-actionable copy; anything
 * else can carry Postgres internals, so it is logged server-side and swapped
 * for a generic fallback — same posture as the auth actions.
 */
function friendlySubmitError(message: string): string {
  const known = new Set([
    "Only students may submit applications",
    "Departure time must be in the future",
    "Your profile is missing a department assignment — contact the administration",
    "A medical document is required for this request type",
    "No approval rule is configured for this request type — contact the administration",
  ]);
  if (known.has(message)) return message;
  console.error("Unhandled application submit error:", message);
  return "Submission failed — try again in a moment, or contact the administration office.";
}

/**
 * Server-mediated upload (D-016): the browser sends fields + the document in
 * one server-action call and never receives a bucket write credential. The id
 * is generated SERVER-side so the storage path `{application_id}/{uuid}.{ext}`
 * is final before the row exists (0008); a submission that fails after upload
 * removes the object, so no orphaned files are left behind.
 */
export async function submitApplicationAction(
  _prevState: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      status: "error",
      message: "Your session expired — sign in and try again.",
      fieldErrors: {},
    };
  }

  const parsed = applicationSchema.safeParse({
    reason: String(formData.get("reason") ?? ""),
    departureAt: String(formData.get("departureAt") ?? ""),
    expectedReturnAt: String(formData.get("expectedReturnAt") ?? ""),
    explanation: String(formData.get("explanation") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }
  const input = parsed.data;

  // The medical UI always asks for a document (the seeded rules require one);
  // the DB function remains the authority if an admin re-configures a rule.
  const fileEntry = formData.get("document");
  if (input.reason === "medical" && (!(fileEntry instanceof File) || fileEntry.size === 0)) {
    return {
      status: "error",
      message: "Attach a medical document (PDF, JPG or PNG, up to 4 MB).",
      fieldErrors: { document: ["Required for medical gate passes"] },
    };
  }

  const applicationId = crypto.randomUUID();
  let docsPayload: Array<{ storage_path: string; content_type: string; byte_size: number; label: string }> = [];
  const admin = createSupabaseAdminClient();

  if (fileEntry instanceof File && fileEntry.size > 0) {
    const declared = documentFileSchema.safeParse(fileEntry);
    if (!declared.success) {
      return {
        status: "error",
        message: "The document was rejected before upload.",
        fieldErrors: fieldErrorsFrom(declared.error),
      };
    }

    // Magic bytes decide the stored content type; the declared File.type is a
    // client claim only. A claim/content mismatch disqualifies the file — a
    // renamed executable "photo.jpg" must be stopped here, not at the gate.
    const bytes = await fileEntry.arrayBuffer();
    const sniffed = sniffDocumentMime(new Uint8Array(bytes.slice(0, 8)));
    if (sniffed === null || sniffed !== fileEntry.type) {
      return {
        status: "error",
        message: "This file is not what it claims to be — PDF, JPG and PNG files only.",
        fieldErrors: { document: ["Content does not match the declared format"] },
      };
    }

    const docPath = `${applicationId}/${crypto.randomUUID()}.${DOCUMENT_EXTENSIONS[sniffed]}`;
    const { error: uploadError } = await admin.storage
      .from("medical-documents")
      .upload(docPath, bytes, { contentType: sniffed, upsert: false });
    if (uploadError) {
      // Nothing was written to the DB yet; the object failed to land.
      console.error("medical-document upload failed:", uploadError.message);
      return {
        status: "error",
        message: "The document could not be stored — please try again.",
        fieldErrors: {},
      };
    }

    docsPayload = [
      {
        storage_path: docPath,
        content_type: sniffed,
        byte_size: fileEntry.size,
        label: "Medical document",
      },
    ];
  }

  // Submitted under the real session so PostgREST derives `auth.uid()` inside
  // the SECURITY DEFINER function — never a trusted client-supplied student id.
  const { data: appRow, error: submitError } = await supabase.rpc("fn_submit_application", {
    p_reason: input.reason,
    p_departure_at: input.departureAt,
    p_expected_return_at: input.expectedReturnAt,
    p_explanation: input.explanation,
    p_docs: docsPayload,
    p_application_id: applicationId,
  });

  if (submitError) {
    // A failed submission must not leave orphaned objects behind; the app row
    // (steps, notifications, audit) is rolled back by the function's own
    // transaction before the error ever reaches us.
    if (docsPayload.length > 0) {
      const { error: removalError } = await admin.storage
        .from("medical-documents")
        .remove([docsPayload[0].storage_path]);
      if (removalError) {
        console.error("orphan removal failed — inspect storage:", removalError.message, docsPayload[0].storage_path);
      }
    }
    return {
      status: "error",
      message: friendlySubmitError(submitError.message),
      fieldErrors: {},
    };
  }

  revalidatePath("/student");
  redirect(`/student?submitted=${encodeURIComponent(appRow.id)}`);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    // Do not swallow: leave an explicit marker so the user can tell a failed
    // logout from a normal one; the session remains until middleware agrees.
    console.error("sign-out failed:", error.message);
    redirect("/login?signout=failed");
  }
  redirect("/login");
}

/**
 * Mark every unread notification of the signed-in user as read. The column
 * GRANT `UPDATE (read_at)` + own-row RLS policy (0003/0004) pin the touch to
 * the user's own unread rows — no workflow authority is involved, so a plain
 * RLS-covered update is the whole implementation (no definer function).
 */
export async function markNotificationsReadAction() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) {
    // Never swallow: the banner state lets the user tell a failed update from a
    // successful one.
    console.error("mark-notifications-read failed:", error.message, error.code);
    redirect("/student?notifications=error");
  }
  redirect("/student?notifications=read");
}
