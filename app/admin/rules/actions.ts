"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { type AdminActionState } from "@/lib/admin/form-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createRuleSchema,
  ruleIdSchema,
  updateRuleSchema,
} from "@/lib/validation/admin";
import { fieldErrorsFrom } from "@/lib/validation/field-errors";

/**
 * P0001 copy from the 0015 functions. Anything else is logged and replaced
 * with a generic message — internals never reach the browser.
 */
const KNOWN_MESSAGES = new Set([
  "Only administrators may manage approval rules",
  "Rule not found",
  "Department not found",
  "Choose a request type",
  "Approval chain must be an array of roles",
  "Approval chain must have one or two steps",
  "Approval chain roles must be faculty or hod",
  "Approval chain cannot repeat a role",
  "Choose whether a medical document is required",
  "Pass validity must be between 1 and 720 hours",
  "Emergency requests always route directly to the HOD",
  "A rule for this department and request type already exists - edit it instead",
  "Global default rules cannot be deleted - edit it instead",
]);

const SESSION_EXPIRED = "Your session expired — sign in and try again.";
const GENERIC = "The change could not be saved — try again, or contact the system administrator.";

function failure(
  message: string,
  fieldErrors: Record<string, string[]> = {},
): AdminActionState {
  return { status: "error", message, fieldErrors };
}

function mapDbError(message: string): AdminActionState {
  if (message.startsWith("Approval chain")) {
    return failure(message, { chain: [message] });
  }
  if (message.startsWith("Pass validity")) {
    return failure(message, { passValidityHours: [message] });
  }
  if (message === "Emergency requests always route directly to the HOD") {
    return failure(message, { chain: [message] });
  }
  if (message === "Department not found") {
    return failure(message, { departmentId: [message] });
  }
  if (
    message === "A rule for this department and request type already exists - edit it instead"
  ) {
    return failure(message, { reason: [message] });
  }
  if (KNOWN_MESSAGES.has(message)) {
    return failure(message);
  }
  console.error("Unhandled rule admin error:", message);
  return failure(GENERIC);
}

async function sessionClient() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

function parseRuleFields(formData: FormData) {
  return {
    reason: String(formData.get("reason") ?? ""),
    chain: String(formData.get("chain") ?? ""),
    requiresMedicalDocument: String(formData.get("requiresMedicalDocument") ?? ""),
    passValidityHours: String(formData.get("passValidityHours") ?? ""),
  };
}

export async function createRuleAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await sessionClient();
  if (!supabase) return failure(SESSION_EXPIRED);

  const parsed = createRuleSchema.safeParse({
    ...parseRuleFields(formData),
    departmentId: String(formData.get("departmentId") ?? ""),
  });
  if (!parsed.success) {
    return failure("Check the highlighted fields.", fieldErrorsFrom(parsed.error));
  }

  const { error } = await supabase.rpc("fn_admin_create_rule", {
    p_department_id: parsed.data.departmentId,
    p_reason: parsed.data.reason,
    p_chain: parsed.data.chain.split(","),
    p_requires_medical_document: parsed.data.requiresMedicalDocument,
    p_pass_validity_hours: parsed.data.passValidityHours,
  });
  if (error) return mapDbError(error.message);

  revalidatePath("/admin/rules");
  return {
    status: "success",
    message: "Rule added.",
    fieldErrors: {},
    resetKey: Date.now(),
  };
}

export async function updateRuleAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await sessionClient();
  if (!supabase) return failure(SESSION_EXPIRED);

  const parsed = updateRuleSchema.safeParse({
    ...parseRuleFields(formData),
    ruleId: String(formData.get("ruleId") ?? ""),
  });
  if (!parsed.success) {
    return failure("Check the highlighted fields.", fieldErrorsFrom(parsed.error));
  }

  const { error } = await supabase.rpc("fn_admin_update_rule", {
    p_id: parsed.data.ruleId,
    p_chain: parsed.data.chain.split(","),
    p_requires_medical_document: parsed.data.requiresMedicalDocument,
    p_pass_validity_hours: parsed.data.passValidityHours,
  });
  if (error) return mapDbError(error.message);

  revalidatePath("/admin/rules");
  revalidatePath(`/admin/rules/${parsed.data.ruleId}`);
  return {
    status: "success",
    message: "Rule updated.",
    fieldErrors: {},
    resetKey: Date.now(),
  };
}

export async function deleteRuleAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await sessionClient();
  if (!supabase) return failure(SESSION_EXPIRED);

  const id = ruleIdSchema.safeParse(String(formData.get("ruleId") ?? ""));
  if (!id.success) return failure("Malformed rule reference.");

  const { error } = await supabase.rpc("fn_admin_delete_rule", { p_id: id.data });
  if (error) return mapDbError(error.message);

  revalidatePath("/admin/rules");
  redirect("/admin/rules?notice=deleted");
}
