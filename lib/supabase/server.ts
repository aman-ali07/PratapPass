import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server client for server components / server actions / route handlers,
 * wired to the Next.js cookie store so Supabase session refresh persists.
 *
 * The `setAll` try/catch is the documented Supabase+Next pattern: server
 * components cannot write cookies (Next throws when they try); session
 * refresh writes are owned by the middleware update-session path, which runs
 * alongside and persists them. Errors there are never authorization-critical.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components cannot write cookies (Next throws on the
            // attempt). In server actions the cookie store IS writable, but
            // middleware performs the durable refresh on every request — if a
            // write fails here the worst outcome is a dropped session cookie
            // (user sees the login page again), never an authz bypass.
          }
        },
      },
    },
  );
}
