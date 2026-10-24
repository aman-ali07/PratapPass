import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { PASS_RESULTS, type PassGateResult } from "@/lib/gate/results";
import type { Database } from "@/lib/supabase/database.types";
import type { GateEvent } from "@/lib/validation/gate";

const passSummarySchema = z.object({
  pass_code: z.string().nullable(),
  holder: z.string().min(1),
  valid_from: z.string(),
  expires_at: z.string(),
  revoked_at: z.string().nullable(),
});

/**
 * `fn_gate_record` returns the pass identity + classification (never reason or
 * document text). `invalid_token` carries only the result; a resolved pass
 * carries the summary fields.
 */
const responseSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("invalid_token") }),
  z.object({
    result: z.enum(PASS_RESULTS),
    ...passSummarySchema.shape,
  }),
]);

export interface GatePassRecordSummary {
  passCode: string | null;
  holderName: string;
  validFrom: string;
  expiresAt: string;
  revokedAt: string | null;
}

export type GateRecording =
  | { result: "invalid_token"; pass: null }
  | { result: PassGateResult; pass: GatePassRecordSummary };

/**
 * Recording authority for security/admin (migration 0005): appends the
 * append-only verification log and completes the application on a valid
 * return. Role enforcement lives in the function; callers pre-check only to
 * return a clean 403/redirect instead of surfacing a raw P0001.
 */
export async function recordGateEvent(
  supabase: SupabaseClient<Database>,
  probe: string,
  event: GateEvent,
): Promise<GateRecording> {
  const { data, error } = await supabase.rpc("fn_gate_record", {
    p_token_or_code: probe,
    p_event: event,
  });
  if (error) {
    throw new Error(`fn_gate_record failed: ${error.message}`);
  }

  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`fn_gate_record returned an unexpected shape: ${parsed.error.message}`);
  }

  if (parsed.data.result === "invalid_token") {
    return { result: "invalid_token", pass: null };
  }

  const row = parsed.data;
  return {
    result: row.result,
    pass: {
      passCode: row.pass_code,
      holderName: row.holder,
      validFrom: row.valid_from,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    },
  };
}
