import { z } from "zod";

/**
 * A gate probe is either the raw QR token (64 hex) or the human pass code
 * (`MPGI-*`). Shape is validated here; whether a code is acceptable for the
 * caller is decided in the database — `fn_gate_verify` refuses the code path
 * for anonymous callers because 24-bit codes must not be enumerable (D-018).
 */
export const gateProbeSchema = z
  .string()
  .trim()
  .min(1, { error: "Provide the pass token or code." })
  .max(128, { error: "That pass reference is too long." });

export const gateEventSchema = z.enum(["exit", "return", "rejection"] as const);
export type GateEvent = z.infer<typeof gateEventSchema>;

/** Shared by the server action and the recording route handler. */
export const gateRecordSchema = z.object({
  token: gateProbeSchema,
  event: gateEventSchema,
});

/** JSON route bodies reject unknown fields (AGENTS.md §4). */
export const gateVerifyRequestSchema = z.object({ token: gateProbeSchema }).strict();
export const gateRecordRequestSchema = gateRecordSchema.strict();
