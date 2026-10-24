import { z } from "zod";

import { emailSchema, fullNameSchema, rollNumberSchema } from "@/lib/validation/auth";

/**
 * Boundary schemas for the admin console. The SECURITY DEFINER functions
 * re-validate the same contracts; these exist so the forms fail fast with
 * field-level copy instead of round-tripping to the database.
 */

export const departmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Department name must be at least 2 characters." })
    .max(80, { error: "Department name must fit in 80 characters." }),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,12}$/, {
      error: "Code must be 2-12 characters: A-Z, 0-9 or hyphen.",
    }),
});

export type DepartmentInput = z.infer<typeof departmentSchema>;

// `z.guid()` checks the Postgres uuid shape without Zod 4's version/variant
// rules: the seed and smoke fixtures intentionally use version-0 ids.
export const departmentIdSchema = z.guid({ error: "Malformed department reference." });
export const userIdSchema = z.guid({ error: "Malformed user reference." });

export const userRoleSchema = z.enum(["student", "faculty", "hod", "security", "admin"]);
export type AdminUserRole = z.infer<typeof userRoleSchema>;

const optionalDepartmentId = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .pipe(z.guid({ error: "Choose a valid department." }).nullable());

const optionalRollNumber = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .pipe(rollNumberSchema.nullable());

const optionalDesignation = z
  .string()
  .trim()
  .max(80, { error: "Designation must fit in 80 characters." })
  .transform((value) => (value === "" ? null : value));

const userFieldsSchema = z.object({
  fullName: fullNameSchema,
  role: userRoleSchema,
  departmentId: optionalDepartmentId,
  rollNumber: optionalRollNumber,
  designation: optionalDesignation,
});

type UserFields = z.infer<typeof userFieldsSchema>;

/**
 * Cross-field contract shared by create/update. The database enforces the same
 * rules; this copy exists so the form highlights the right input.
 */
function checkRoleFields(data: UserFields, ctx: z.RefinementCtx): void {
  if (data.role === "student") {
    if (!data.rollNumber) {
      ctx.addIssue({
        code: "custom",
        path: ["rollNumber"],
        message: "Students need a roll number.",
      });
    }
    if (!data.departmentId) {
      ctx.addIssue({
        code: "custom",
        path: ["departmentId"],
        message: "Students need a department assignment.",
      });
    }
    return;
  }

  if ((data.role === "faculty" || data.role === "hod") && !data.departmentId) {
    ctx.addIssue({
      code: "custom",
      path: ["departmentId"],
      message: "Faculty and HOD accounts need a department.",
    });
  }
}

/** Staff never carry a roll number; students never carry a designation. */
function roleAdjustedFields(data: UserFields): Pick<UserFields, "rollNumber" | "designation"> {
  return {
    rollNumber: data.role === "student" ? data.rollNumber : null,
    designation: data.role === "student" ? null : data.designation,
  };
}

export const createUserSchema = userFieldsSchema
  .extend({ email: emailSchema })
  .superRefine(checkRoleFields)
  .transform((data) => ({ ...data, ...roleAdjustedFields(data) }));

export const updateUserSchema = userFieldsSchema
  .extend({ userId: userIdSchema })
  .superRefine(checkRoleFields)
  .transform((data) => ({ ...data, ...roleAdjustedFields(data) }));

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/**
 * GET filters on /admin/users. Malformed or repeated query values degrade to
 * "no filter" instead of erroring a read-only page.
 */
export const userSearchSchema = z.object({
  q: z.string().trim().max(100, { error: "Search is limited to 100 characters." }).catch(""),
  role: z.union([userRoleSchema, z.literal("")]).catch(""),
});

// Approval rules (T-12c) -------------------------------------------------------

export const gateReasonSchema = z.enum(["medical", "personal", "emergency", "other"]);
export type GateReason = z.infer<typeof gateReasonSchema>;

/**
 * The four supported chains. Order matters: `fn_submit_application` creates
 * steps in array order, so "hod,faculty" is a real (if unusual) configuration.
 * The database re-validates the same shape (0015).
 */
export const RULE_CHAIN_VALUES = ["faculty", "faculty,hod", "hod", "hod,faculty"] as const;
export type RuleChainValue = (typeof RULE_CHAIN_VALUES)[number];
export const ruleChainSchema = z.enum(RULE_CHAIN_VALUES);

export const ruleIdSchema = z.guid({ error: "Malformed rule reference." });

const ruleFields = {
  reason: gateReasonSchema,
  chain: ruleChainSchema,
  requiresMedicalDocument: z.string().transform((value) => value === "on"),
  passValidityHours: z.coerce
    .number()
    .int({ error: "Enter a whole number of hours." })
    .min(1, { error: "Pass validity must be at least 1 hour." })
    .max(720, { error: "Pass validity cannot exceed 720 hours." }),
};

function checkEmergencyChain(
  data: { reason: GateReason; chain: RuleChainValue },
  ctx: z.RefinementCtx,
): void {
  if (data.reason === "emergency" && data.chain !== "hod") {
    ctx.addIssue({
      code: "custom",
      path: ["chain"],
      message: "Emergency requests always route directly to the HOD.",
    });
  }
}

export const createRuleSchema = z
  .object({ ...ruleFields, departmentId: departmentIdSchema })
  .superRefine(checkEmergencyChain);

export const updateRuleSchema = z
  .object({ ...ruleFields, ruleId: ruleIdSchema })
  .superRefine(checkEmergencyChain);

export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;

// Analytics & audit (T-13) -----------------------------------------------------

/** Rows per audit page; the SQL clamps to the same 1..200 window. */
export const AUDIT_PAGE_SIZE = 50;

/**
 * A real calendar date (rejects 2026-02-31, which Date would silently roll
 * into March). Empty means "no bound"; a malformed value degrades to no bound
 * rather than erroring, matching the search schemas above.
 */
const dateOnlySchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    },
    { error: "Use a real date (YYYY-MM-DD)." },
  );

export const auditFilterSchema = z.object({
  actor: z.union([z.literal(""), z.literal("system"), z.guid()]).catch(""),
  action: z.string().trim().max(80, { error: "Filter at most 80 characters." }).catch(""),
  from: z.union([dateOnlySchema, z.literal("")]).catch(""),
  to: z.union([dateOnlySchema, z.literal("")]).catch(""),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

export type AuditFilter = z.infer<typeof auditFilterSchema>;
