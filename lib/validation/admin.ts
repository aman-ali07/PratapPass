import { z } from "zod";

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
