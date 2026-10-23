"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { type ApplicationActionState } from "@/lib/application/form-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrorsFrom } from "@/lib/validation/field-errors";
import { decisionSchema } from "@/lib/validation/decision";

/**
 * P0001 messages from `fn_decide_application` that are already user-copy, and
 * the ones that mean "the world moved under this form" — the latter surface as
 * an explicit re-sync banner (API.md §5: never a silent overwrite), not an
 * error the user would retry into the same wall.
 */
const KNOWN_MESSAGES = new Set([
  "Only faculty or HOD members may decide applications",
  "Application not found",
  "This application belongs to another department",
  "You are not the assigned approver for the current step",
  "Remarks are required when rejecting or requesting information",
  "Remarks must fit in 1000 characters",
  "Unknown action",
]);

function isStaleStateMessage(message: string): boolean {
  return (
    message === "No pending approval step matches this application" ||
    message.startsWith("This application is not awaiting a decision (")
  );
}

const STALE_MESSAGE =
  "This application has already been handled by another reviewer — the page below now shows its current state.";

/**
 * Reviewer decision (approve / reject / request_info) routed through
 * `fn_decide_application` under the real session: the database function is the
 * sole authority for chain order, scope and the append-only history rows.
 */
export async function decideApplicationAction(
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

  const parsed = decisionSchema.safeParse({
    applicationId: String(formData.get("applicationId") ?? ""),
    action: String(formData.get("action") ?? ""),
    remarks: String(formData.get("remarks") ?? "") || undefined,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "The decision could not be recorded as submitted.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }
  const { applicationId, action, remarks } = parsed.data;

  const { data: decidedStep, error } = await supabase.rpc("fn_decide_application", {
    p_application_id: applicationId,
    p_action: action,
    p_remarks: remarks,
  });

  if (error) {
    const message = error.message;
    if (!KNOWN_MESSAGES.has(message) && !isStaleStateMessage(message)) {
      console.error("Unhandled decision error:", message);
    }
    // Match the fn's copy for the remarks cases so the resolution is doable in
    // the form itself; every other known message surfaces as given.
    return {
      status: "error",
      message: KNOWN_MESSAGES.has(message)
        ? message
        : isStaleStateMessage(message)
          ? STALE_MESSAGE
          : "The decision could not be recorded — try again, or contact the administration office.",
      fieldErrors: message.includes("Remarks") ? { remarks: [message] } : {},
    };
  }

  const detailPath = `/approver/requests/${applicationId}`;
  revalidatePath(detailPath);
  revalidatePath("/approver/requests");
  revalidatePath("/approver/history");
  revalidatePath("/student");
  if (!decidedStep || typeof decidedStep !== "object") {
    // The decision IS recorded at this point (no rpc error) — a malformed
    // return shape is logged, not treated as a failure to undo.
    console.error("fn_decide_application returned an unexpected shape:", typeof decidedStep);
  }
  redirect(detailPath);
}
