import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Service-role client (SECURITY.md §1/§7): bypasses RLS. Import ONLY in
 * server-only modules; never from client components and never into a
 * `NEXT_PUBLIC_*` variable. Guarded by the `server-only` package so a stray
 * client import breaks the build.
 */
export function createSupabaseAdminClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — admin/service operations are unavailable.",
    );
  }
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
