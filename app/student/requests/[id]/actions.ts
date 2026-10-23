"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { type ApplicationActionState } from "@/lib/application/form-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrorsFrom } from "@/lib/validation/field-errors";
import { infoAnswerSchema } from "@/lib/validation/application";

/**
 * DB-function (P0001) messages that are already user-actionable copy; anything
 * else can carry Postgres internals and is swapped server-side (auth actions
 * posture). The function itself re-checks ownership, state and length.
 */
function friendlyInfoError(message: string): string {
  const known = new Set([
    "Only the owning student may provide information",
    "This application is not awaiting additional information",
    "Answer must be 1–2000 characters",
    "No step is waiting for information — contact the administration",
    "Application not found",
  ]);
  if (known.has(message)) return message;
  console.error("Unhandled provide-info error:", message);
  return "Could not deliver your answer — try again, or contact the administration office.";
}

/**
 * Student answer to an `additional_info_required` request, routed through
 * `fn_provide_info` (workflow authority): stores the answer, resumes the
 * paused step, notifies the reviewing staff member.
 */
export async function answerAdditionalInfoAction(
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

  const parsed = infoAnswerSchema.safeParse({
    applicationId: String(formData.get("applicationId") ?? ""),
    text: String(formData.get("text") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please review your answer.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }
  const { applicationId, text } = parsed.data;

  const { error } = await supabase.rpc("fn_provide_info", {
    p_application_id: applicationId,
    p_text: text,
  });
  if (error) {
    return {
      status: "error",
      message: friendlyInfoError(error.message),
      fieldErrors: {},
    };
  }

  const detailPath = `/student/requests/${applicationId}`;
  revalidatePath(detailPath);
  revalidatePath("/student");
  revalidatePath("/student/requests");
  redirect(detailPath);
}
