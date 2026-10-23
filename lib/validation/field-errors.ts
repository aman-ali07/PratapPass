import { type z } from "zod";

/**
 * Zod issues → per-field error map, shared by every useActionState form
 * (auth + application). Issues without a field path treat as form-level and
 * are dropped here (callers show their own top-level message).
 */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    if (issue.path.length === 0) continue;
    const field = issue.path.join(".");
    (fieldErrors[field] ??= []).push(issue.message);
  }
  return fieldErrors;
}
