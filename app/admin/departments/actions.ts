"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { type AdminActionState } from "@/lib/admin/form-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { departmentIdSchema, departmentSchema } from "@/lib/validation/admin";
import { fieldErrorsFrom } from "@/lib/validation/field-errors";

/**
 * P0001 copy from the 0012 functions. Anything else is logged and replaced
 * with a generic message — internals never reach the browser.
 */
const KNOWN_MESSAGES = new Set([
  "Only administrators may manage departments",
  "Department not found",
  "A department with this name or code already exists",
  "Department name must be 2-80 characters",
  "Department code must be 2-12 characters (A-Z, 0-9, hyphen)",
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
  if (message.startsWith("Department is still referenced")) {
    // The database includes the exact reference counts — that copy is the
    // actionable part, so surface it verbatim.
    return failure(message);
  }
  if (KNOWN_MESSAGES.has(message)) {
    return failure(message);
  }
  console.error("Unhandled department admin error:", message);
  return failure(GENERIC);
}

async function sessionClient() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

function parseDepartment(formData: FormData) {
  return departmentSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    code: String(formData.get("code") ?? ""),
  });
}

export async function createDepartmentAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await sessionClient();
  if (!supabase) return failure(SESSION_EXPIRED);

  const parsed = parseDepartment(formData);
  if (!parsed.success) {
    return failure("Check the highlighted fields.", fieldErrorsFrom(parsed.error));
  }

  const { error } = await supabase.rpc("fn_admin_create_department", {
    p_name: parsed.data.name,
    p_code: parsed.data.code,
  });
  if (error) return mapDbError(error.message);

  revalidatePath("/admin/departments");
  return {
    status: "success",
    message: "Department added.",
    fieldErrors: {},
    resetKey: Date.now(),
  };
}

export async function updateDepartmentAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await sessionClient();
  if (!supabase) return failure(SESSION_EXPIRED);

  const id = departmentIdSchema.safeParse(String(formData.get("departmentId") ?? ""));
  if (!id.success) return failure("Malformed department reference.");

  const parsed = parseDepartment(formData);
  if (!parsed.success) {
    return failure("Check the highlighted fields.", fieldErrorsFrom(parsed.error));
  }

  const { error } = await supabase.rpc("fn_admin_update_department", {
    p_id: id.data,
    p_name: parsed.data.name,
    p_code: parsed.data.code,
  });
  if (error) return mapDbError(error.message);

  revalidatePath("/admin/departments");
  revalidatePath(`/admin/departments/${id.data}`);
  return {
    status: "success",
    message: "Department updated.",
    fieldErrors: {},
    resetKey: Date.now(),
  };
}

export async function deleteDepartmentAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await sessionClient();
  if (!supabase) return failure(SESSION_EXPIRED);

  const id = departmentIdSchema.safeParse(String(formData.get("departmentId") ?? ""));
  if (!id.success) return failure("Malformed department reference.");

  const { error } = await supabase.rpc("fn_admin_delete_department", { p_id: id.data });
  if (error) return mapDbError(error.message);

  revalidatePath("/admin/departments");
  redirect("/admin/departments?notice=deleted");
}
