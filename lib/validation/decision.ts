import { z } from "zod";

/**
 * Decision input for `fn_decide_application` (the SECURITY DEFINER authority
 * re-checks role, department, chain order and remarks length — the boundary
 * schema just mirrors the contract members so both sides fail identically).
 */
export const decisionSchema = z.object({
  applicationId: z.uuid({ error: "Malformed application reference." }),
  action: z.enum(["approve", "reject", "request_info"] as const),
  remarks: z
    .string()
    .trim()
    .max(1000, { error: "Remarks must fit in 1000 characters." })
    .optional(),
}).refine(
  (decision) => decision.action === "approve" || (decision.remarks ?? "").length > 0,
  { error: "Remarks are required when rejecting or requesting information.", path: ["remarks"] },
);

export type DecisionInput = z.infer<typeof decisionSchema>;
