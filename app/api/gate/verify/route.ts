import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api/json-error";
import { verifyGatePass } from "@/lib/gate/verify";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gateVerifyRequestSchema } from "@/lib/validation/gate";

/** The response carries holder PII — never cache it anywhere. */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Public classification endpoint (API.md §3): the raw token IS the credential,
 * so no session is required. Anonymous callers may present only the 256-bit
 * token — `fn_gate_verify` refuses pass codes for them (24-bit identifiers
 * must not be enumerable, D-018). Read-only: no log row is written here.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be JSON.");
  }

  const parsed = gateVerifyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "invalid_request", "Provide a pass token (1–128 characters).");
  }

  const supabase = await createSupabaseServerClient();
  try {
    const verification = await verifyGatePass(supabase, parsed.data.token);
    return NextResponse.json(
      {
        result: verification.result,
        pass:
          verification.result === "invalid_token"
            ? null
            : {
                holder_name: verification.pass.holderName,
                department: verification.pass.department,
                departure_window: {
                  valid_from: verification.pass.validFrom,
                  expires_at: verification.pass.expiresAt,
                },
                exit_state: verification.pass.exitState,
              },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error(
      "gate verify failed:",
      error instanceof Error ? error.message : error,
    );
    return jsonError(500, "internal_error", "Verification is temporarily unavailable.");
  }
}
