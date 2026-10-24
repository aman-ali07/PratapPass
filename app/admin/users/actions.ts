"use server";

import { revalidatePath } from "next/cache";

import { type AdminActionState } from "@/lib/admin/form-state";
import { generatePassword } from "@/lib/admin/password";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createUserSchema, updateUserSchema, userIdSchema } from "@/lib/validation/admin";
import { fieldErrorsFrom } from "@/lib/validation/field-errors";

/**
 * P0001 copy from the 0013 functions. Anything else is logged and replaced
 * with a generic message — internals never reach the browser.
 */
const KNOWN_MESSAGES = new Set([
  "Only administrators may manage users",
  "User not found",
  "User account not found - create the sign-in account first",
  "Full name must be 2-80 characters",
  "Designation must fit in 80 characters",
  "Department not found",
  "Students need a roll number",
  "Students need a department assignment",
  "Faculty and HOD accounts need a department",
  "Roll number must be 3-20 letters or digits",
  "This roll number is already registered",
  "You cannot change your own role",
  "The last administrator cannot be demoted - promote another administrator first",
]);

const ONLY_ADMIN = "Only administrators may manage users.";
const SESSION_EXPIRED = "Your session expired — sign in and try again.";
const GENERIC = "The change could not be saved — try again, or contact the system administrator.";
const SERVICE_UNAVAILABLE =
  "Account provisioning is unavailable — the server is missing its service credentials.";

function failure(
  message: string,
  fieldErrors: Record<string, string[]> = {},
  generatedPassword?: string,
  accountEmail?: string,
): AdminActionState {
  return { status: "error", message, fieldErrors, generatedPassword, accountEmail };
}

function mapUserDbError(message: string): AdminActionState {
  if (
    message === "This roll number is already registered" ||
    message === "Roll number must be 3-20 letters or digits" ||
    message === "Students need a roll number"
  ) {
    return failure(message, { rollNumber: [message] });
  }
  if (
    message === "Students need a department assignment" ||
    message === "Faculty and HOD accounts need a department" ||
    message === "Department not found"
  ) {
    return failure(message, { departmentId: [message] });
  }
  if (message === "Full name must be 2-80 characters") {
    return failure(message, { fullName: [message] });
  }
  if (message === "Designation must fit in 80 characters") {
    return failure(message, { designation: [message] });
  }
  // The database includes the exact pending-work counts — that copy is the
  // actionable part, so surface it verbatim.
  if (message.startsWith("This approver still has") || message.startsWith("This student has")) {
    return failure(message);
  }
  if (KNOWN_MESSAGES.has(message)) {
    return failure(message);
  }
  console.error("Unhandled user admin error:", message);
  return failure(GENERIC);
}

function mapCreateError(message: string): AdminActionState {
  const lower = message.toLowerCase();
  if (lower.includes("already") && lower.includes("registered")) {
    return failure("An account with this email already exists.", {
      email: ["Already in use."],
    });
  }
  if (lower.includes("email")) {
    return failure("Enter a valid email address.", { email: ["Invalid email address."] });
  }
  if (lower.includes("password")) {
    return failure("The generated password was rejected — try again.");
  }
  console.error("Unhandled user provisioning error:", message);
  return failure(GENERIC);
}

/**
 * Session + authoritative admin check. The RPCs re-check in Postgres; this
 * pre-check exists so a non-admin can never reach GoTrue's service-role admin
 * API (create/reset) at all.
 */
async function adminSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: failure(SESSION_EXPIRED) };

  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error) {
    console.error("admin pre-check failed:", error.message, error.code);
    return { error: failure(GENERIC) };
  }
  if (isAdmin !== true) return { error: failure(ONLY_ADMIN) };

  return { supabase, user };
}

function serviceClient() {
  try {
    return { admin: createSupabaseAdminClient() };
  } catch (error) {
    console.error(
      "service-role client unavailable:",
      error instanceof Error ? error.message : error,
    );
    return { error: failure(SERVICE_UNAVAILABLE) };
  }
}

export async function createUserAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const session = await adminSession();
  if (session.error) return session.error;
  const { supabase } = session;

  const parsed = createUserSchema.safeParse({
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
    departmentId: String(formData.get("departmentId") ?? ""),
    rollNumber: String(formData.get("rollNumber") ?? ""),
    designation: String(formData.get("designation") ?? ""),
  });
  if (!parsed.success) {
    return failure("Check the highlighted fields.", fieldErrorsFrom(parsed.error));
  }
  const input = parsed.data;

  // Same boundary RPC as self-registration. The unique index remains the
  // authority; this catches the common case before creating an auth user.
  if (input.role === "student" && input.rollNumber) {
    const { data: available, error } = await supabase.rpc("check_roll_number_available", {
      candidate: input.rollNumber,
    });
    if (error) {
      console.error("roll-number pre-check failed:", error.message, error.code);
      return failure(GENERIC);
    }
    if (!available) {
      return failure("This roll number is already registered.", {
        rollNumber: ["Already in use."],
      });
    }
  }

  const client = serviceClient();
  if (client.error) return client.error;
  const { admin } = client;

  const password = generatePassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password,
    // Email delivery is deferred (KI-003): the admin hands the password over.
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });

  if (createError || !created.user) {
    return mapCreateError(createError?.message ?? "unknown provisioning failure");
  }
  const userId = created.user.id;

  const { error: profileError } = await supabase.rpc("fn_admin_create_user", {
    p_user_id: userId,
    p_full_name: input.fullName,
    p_role: input.role,
    p_department_id: input.departmentId,
    p_roll_number: input.rollNumber,
    p_designation: input.designation,
  });

  if (profileError) {
    // The account was created moments ago and has no history, so the rollback
    // is safe (0014 makes that explicit at the FK level).
    const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);
    if (cleanupError) {
      console.error(
        "user provisioning rollback failed:",
        cleanupError.message,
        "user:",
        userId,
      );
      return failure(
        `The sign-in account was created but its profile could not be configured, and cleanup failed. Find ${input.email} under Users, set the role and department, then reset its password.`,
      );
    }
    return mapUserDbError(profileError.message);
  }

  revalidatePath("/admin/users");
  return {
    status: "success",
    message: `Account created for ${input.email}. Share the password below — it is shown once.`,
    fieldErrors: {},
    resetKey: Date.now(),
    generatedPassword: password,
    accountEmail: input.email,
  };
}

export async function updateUserAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const session = await adminSession();
  if (session.error) return session.error;
  const { supabase } = session;

  const parsed = updateUserSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
    role: String(formData.get("role") ?? ""),
    departmentId: String(formData.get("departmentId") ?? ""),
    rollNumber: String(formData.get("rollNumber") ?? ""),
    designation: String(formData.get("designation") ?? ""),
  });
  if (!parsed.success) {
    return failure("Check the highlighted fields.", fieldErrorsFrom(parsed.error));
  }
  const input = parsed.data;

  const { error } = await supabase.rpc("fn_admin_update_user", {
    p_user_id: input.userId,
    p_full_name: input.fullName,
    p_role: input.role,
    p_department_id: input.departmentId,
    p_roll_number: input.rollNumber,
    p_designation: input.designation,
  });
  if (error) return mapUserDbError(error.message);

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${input.userId}`);
  return {
    status: "success",
    message: "User updated.",
    fieldErrors: {},
    resetKey: Date.now(),
  };
}

export async function resetUserPasswordAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const session = await adminSession();
  if (session.error) return session.error;
  const { supabase } = session;

  const id = userIdSchema.safeParse(String(formData.get("userId") ?? ""));
  if (!id.success) return failure("Malformed user reference.");

  // Also confirms the target exists under the admin guard (the list RPC is
  // admin-only and joins the auth email needed for the hand-off copy).
  const { data: rows, error: lookupError } = await supabase.rpc("fn_admin_list_users", {
    p_user_id: id.data,
  });
  if (lookupError) return mapUserDbError(lookupError.message);
  const target = rows?.[0];
  if (!target) return failure("User not found.");

  const client = serviceClient();
  if (client.error) return client.error;
  const { admin } = client;

  const password = generatePassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(id.data, {
    password,
  });
  if (updateError) {
    console.error("password reset failed:", updateError.message, "user:", id.data);
    return failure("The password could not be reset — try again or contact the system administrator.");
  }

  const { error: auditError } = await supabase.rpc("fn_admin_record_password_reset", {
    p_user_id: id.data,
  });
  if (auditError) {
    // The password HAS changed. Returning it is the only way to avoid locking
    // the user out silently; the warning makes the missing audit explicit.
    console.error("password reset audit failed:", auditError.message, "user:", id.data);
    return failure(
      "The password was changed but the audit record could not be written. Copy the new password now and contact the system administrator.",
      {},
      password,
      target.email,
    );
  }

  revalidatePath(`/admin/users/${id.data}`);
  return {
    status: "success",
    message: `Password reset for ${target.email}. Share it now — it is shown once.`,
    fieldErrors: {},
    generatedPassword: password,
    accountEmail: target.email,
  };
}
