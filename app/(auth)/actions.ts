"use server";

import { z } from "zod";

import { redirect } from "next/navigation";

import { type AuthActionState } from "@/lib/auth/form-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type SignInInput, type SignUpInput, signInSchema, signUpSchema } from "@/lib/validation/auth";

function validationErrors(error: z.ZodError): Record<string, string[]> {
  const flattened = z.flattenError(error);
  return (flattened.fieldErrors ?? {}) as Record<string, string[]>;
}

function friendlyAuthError(message: string): string {
  const known: Record<string, string> = {
    "User already registered": "An account with this email already exists — try signing in.",
    "Email not confirmed": "Confirm your email first, then sign in.",
    "Invalid login credentials": "Email or password is incorrect.",
    "Email rate limit exceeded": "Too many attempts — wait a moment and try again.",
  };
  return known[message] ?? `Authentication failed: ${message}`;
}

export async function signUpStudent(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: String(formData.get("fullName") ?? ""),
    rollNumber: String(formData.get("rollNumber") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: validationErrors(parsed.error),
    };
  }
  const input = parsed.data satisfies SignUpInput;

  const supabase = await createSupabaseServerClient();

  // Roll numbers are unique across profiles; anon users cannot read profiles,
  // so the boundary check lives in this SECURITY DEFINER RPC (SECURITY.md §5).
  const { data: available, error: checkError } = await supabase.rpc(
    "check_roll_number_available",
    { candidate: input.rollNumber },
  );
  if (checkError) {
    return {
      status: "error",
      message: "Could not verify the roll number — please try again.",
      fieldErrors: {},
    };
  }
  if (!available) {
    return {
      status: "error",
      message: "This roll number is already registered.",
      fieldErrors: { rollNumber: ["Already in use"] },
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.fullName, roll_number: input.rollNumber } },
  });

  if (error) {
    return { status: "error", message: friendlyAuthError(error.message), fieldErrors: {} };
  }

  // When email confirmation is enabled (cloud projects), signUp returns the
  // user without a session — the auth.users trigger has already created the
  // student profile row.
  if (data.user && !data.session) {
    return {
      status: "needs-email-confirmation",
      message: "Account created — confirm the link in your email to sign in.",
      fieldErrors: {},
    };
  }

  redirect("/student");
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: validationErrors(parsed.error),
    };
  }
  const input = parsed.data satisfies SignInInput;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(input);

  if (error) {
    return { status: "error", message: friendlyAuthError(error.message), fieldErrors: {} };
  }

  redirect("/student");
}
