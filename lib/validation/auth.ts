import { z } from "zod";

/**
 * Shared auth validation. Roll-number format is a placeholder until the
 * institutional pattern + department prefix map arrive (KI-001); it fixes
 * the important invariants today (trimmed, alphanumeric, 3–20 chars).
 */
export const rollNumberSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{3,20}$/, {
    error: "Roll number must be 3–20 letters or digits (instititional format pending).",
  });

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, { error: "Enter your full name (at least 2 characters)." })
  .max(80, { error: "Name must fit in 80 characters." })
  .transform((value) => value.replace(/\s+/g, " "));

export const passwordSchema = z
  .string()
  .min(8, { error: "Password must be at least 8 characters." })
  .max(72, { error: "Password must be at most 72 characters." });

export const signInSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).transform((value) => value.trim()),
  password: z.string().min(1, { error: "Enter your password." }),
});

export const signUpSchema = z.object({
  fullName: fullNameSchema,
  rollNumber: rollNumberSchema,
  email: z.email({ error: "Enter a valid email address." }).transform((value) => value.trim()),
  password: passwordSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
