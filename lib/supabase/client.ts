import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";

/** Browser client: read-only DB hygiene — the anon key + RLS are the boundary. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
