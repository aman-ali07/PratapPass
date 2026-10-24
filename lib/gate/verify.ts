import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { PASS_RESULTS, type PassGateResult } from "@/lib/gate/results";
import type { Database } from "@/lib/supabase/database.types";

const passSummarySchema = z.object({
  pass_code: z.string().nullable(),
  holder: z.string().min(1),
  department: z.string().nullable(),
  valid_from: z.string(),
  expires_at: z.string(),
  revoked_at: z.string().nullable(),
  exit_state: z.enum(["not_exited", "exited", "returned"] as const),
});

/**
 * `fn_gate_verify` returns a flat jsonb payload: `invalid_token` carries ONLY
 * the result; every resolved pass carries the holder/department/window/state
 * fields. The union is validated at this boundary — an unexpected shape is a
 * loud failure, never a silently half-rendered pass card.
 */
const responseSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("invalid_token") }),
  z.object({
    result: z.enum(PASS_RESULTS),
    ...passSummarySchema.shape,
  }),
]);

export interface GatePassSummary {
  passCode: string | null;
  holderName: string;
  department: string | null;
  validFrom: string;
  expiresAt: string;
  revokedAt: string | null;
  exitState: "not_exited" | "exited" | "returned";
}

export type GateVerification =
  | { result: "invalid_token"; pass: null }
  | { result: PassGateResult; pass: GatePassSummary };

/**
 * Read-only classification for the public `/verify` page and
 * `/api/gate/verify` (migration 0011). Never writes `gate_verification_logs` —
 * anonymous scans cannot be logged (gate_user_id NOT NULL, D-018); recording
 * is `fn_gate_record`'s exclusive job.
 */
export async function verifyGatePass(
  supabase: SupabaseClient<Database>,
  probe: string,
): Promise<GateVerification> {
  const { data, error } = await supabase.rpc("fn_gate_verify", {
    p_token_or_code: probe,
  });
  if (error) {
    throw new Error(`fn_gate_verify failed: ${error.message}`);
  }

  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`fn_gate_verify returned an unexpected shape: ${parsed.error.message}`);
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
      department: row.department,
      validFrom: row.valid_from,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      exitState: row.exit_state,
    },
  };
}
