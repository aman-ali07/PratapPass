"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

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
