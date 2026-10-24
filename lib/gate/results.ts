/**
 * Gate classification vocabulary — mirrors the `verification_result` enum
 * (0003) exactly. `staff_rejected` is produced only by `fn_gate_record`; the
 * read-only verify function never returns it, but the shared union keeps the
 * recording banner type-safe.
 */
export const PASS_RESULTS = [
  "valid",
  "expired",
  "revoked",
  "already_exited",
  "already_returned",
  "staff_rejected",
] as const;

export const GATE_RESULTS = [...PASS_RESULTS, "invalid_token"] as const;

export type PassGateResult = (typeof PASS_RESULTS)[number];
export type GateResult = (typeof GATE_RESULTS)[number];

export function isGateResult(value: string): value is GateResult {
  return (GATE_RESULTS as readonly string[]).includes(value);
}
