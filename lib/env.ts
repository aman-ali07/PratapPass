import { z } from "zod";

/**
 * Environment contract (SECURITY.md §7): `NEXT_PUBLIC_*` are safe to expose;
 * `SUPABASE_SERVICE_ROLE_KEY` is consumed only inside server-only modules
 * (lib/supabase/admin.ts). Fails fast at module load with a clear message
 * instead of surfacing as a runtime 500 deep in a flow.
 */
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ error: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL." }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, { error: "NEXT_PUBLIC_SUPABASE_ANON_KEY missing or too short." }),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, { error: "SUPABASE_SERVICE_ROLE_KEY missing or too short." })
    .optional(),
  NEXT_PUBLIC_SITE_URL: z
    .url({ error: "NEXT_PUBLIC_SITE_URL must be a valid URL (no trailing slash)." })
    .default("http://localhost:3000"),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
