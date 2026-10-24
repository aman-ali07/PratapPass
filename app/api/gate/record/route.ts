import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api/json-error";
import { recordGateEvent } from "@/lib/gate/record";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gateRecordRequestSchema } from "@/lib/validation/gate";

/** Recording responses carry holder PII — never cache them. */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Authenticated recording endpoint (API.md §3): security/admin only. The route
 * pre-checks the role to answer 401/403 cleanly, but `fn_gate_record` remains
 * the authority (it re-checks and appends the append-only log). Unknown
 * tokens return `invalid_token` without a log row — logs require a pass
 * reference (D-018).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be JSON.");
  }

  const parsed = gateRecordRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "invalid_request", "Provide a pass token and a valid event.");
  }
  const { token, event } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError(401, "unauthenticated", "Sign in required.");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "security" && profile?.role !== "admin") {
    return jsonError(403, "forbidden", "Only gate security may record events.");
  }

  try {
    const recording = await recordGateEvent(supabase, token, event);
    return NextResponse.json({ result: recording.result }, { headers: NO_STORE });
  } catch (error) {
    console.error(
      "gate recording failed:",
      error instanceof Error ? error.message : error,
    );
    return jsonError(500, "internal_error", "The gate event could not be recorded.");
  }
}
