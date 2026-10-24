import "server-only";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side gate for /admin pages. Anonymous visitors go to login with a
 * return path; signed-in non-admins go back to their portal. This only keeps
 * non-admins out of an inoperable console — every mutation is re-authorized
 * inside its SECURITY DEFINER function, which remains the authority.
 */
export async function requireAdmin(nextPath: string) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/student");
  }

  return { supabase, user, profile };
}
