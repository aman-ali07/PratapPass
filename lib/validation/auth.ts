import { z } from "zod";

/**
 * Shared auth validation. Roll numbers are canonicalized to uppercase so the
 * stored value and the case-folded DB index (0002 `lower(roll_number)`) can
 * never disagree. Format is a placeholder until the institutional pattern +
 * department prefix map arrive (KI-001).
 */
export const rollNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,20}$/, {
    error: "Roll number must be 3–20 letters or digits (institutional format pending).",
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

// Normalize (trim + lowercase) BEFORE validating — a pasted
// "Aman.1@MpGi.ac.in " must still validate instead of failing on the space.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }));

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Enter your password." }),
});

export const signUpSchema = z.object({
  fullName: fullNameSchema,
  rollNumber: rollNumberSchema,
  email: emailSchema,
  password: passwordSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
