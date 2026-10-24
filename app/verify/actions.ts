"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordGateEvent } from "@/lib/gate/record";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gateRecordSchema } from "@/lib/validation/gate";

function verifyPath(token: string): string {
  return `/verify?token=${encodeURIComponent(token)}`;
}

/**
 * Gate recording from the `/verify` page (API.md §3): the DB function is the
 * authority for role, event legality and the append-only log; this action only
 * validates the form, gates anonymous/wrong-role callers cleanly, and redirects
 * back to the same verification URL with a result marker. `redirect` is kept
 * OUTSIDE the try block — it throws a control-flow error that must not be
 * swallowed by the failure handler.
 */
export async function recordGateEventAction(formData: FormData): Promise<void> {
  const parsed = gateRecordSchema.safeParse({
    token: String(formData.get("token") ?? ""),
    event: String(formData.get("event") ?? ""),
  });
  if (!parsed.success) {
    redirect("/verify?error=invalid_request");
  }
  const { token, event } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(verifyPath(token))}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "security" && profile?.role !== "admin") {
    redirect(`${verifyPath(token)}&error=forbidden`);
  }

  let result: string;
  try {
    const recording = await recordGateEvent(supabase, token, event);
    result = recording.result;
  } catch (error) {
    console.error(
      "gate recording failed:",
      error instanceof Error ? error.message : error,
    );
    redirect(`${verifyPath(token)}&error=record_failed`);
  }

  // A valid return completes the application — keep the student surfaces fresh.
  revalidatePath("/student");
  revalidatePath("/student/requests");
  revalidatePath("/student/passes");
  redirect(`${verifyPath(token)}&recorded=${event}:${result}`);
}
