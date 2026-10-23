import { z } from "zod";

/**
 * Shared application-submission validation. Times arrive as UTC ISO strings —
 * the client converts `datetime-local` to ISO with the browser's real offset
 * before submit (a naive string would be parsed in the SERVER's timezone,
 * skewing the pass validity window for every non-UTC campus clock).
 *
 * The 4 MiB document cap is a product decision (D-016): Vercel rejects function
 * bodies over ~4.5 MB at the infrastructure level with no override, which makes
 * a server-mediated upload the transport and 4 MiB the reachable cap. 0007
 * (bucket `file_size_limit`) and 0008 (`byte_size` CHECK) enforce the same
 * number behind the app boundary.
 */
export const DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;

export const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png";

export const reasonSchema = z.enum(["medical", "personal", "emergency"]);

const isoTimestamp = z
  .string({ error: "Enter a date and time." })
  .trim()
  .pipe(z.iso.datetime({ error: "Enter a valid date and time." }));

export const applicationSchema = z
  .object({
    reason: reasonSchema,
    departureAt: isoTimestamp,
    expectedReturnAt: isoTimestamp,
    explanation: z
      .string()
      .trim()
      .min(3, { error: "Describe the reason briefly (3+ characters)." })
      .max(2000, { error: "Explanation must fit in 2000 characters." }),
  })
  .refine(
    (a) => Date.parse(a.expectedReturnAt) > Date.parse(a.departureAt),
    { error: "Expected return must be after departure.", path: ["expectedReturnAt"] },
  );

/**
 * Declared-mime check: a cheap first filter for size/type claims. The magic
 * bytes (lib/documents/magic.ts) are the authority — a mismatch between the
 * claim and the bytes is itself disqualifying (a renamed executable "photo.jpg"
 * must die here, not at the gate).
 */
export const documentFileSchema = z
  .file({ error: "Attach a document file." })
  .max(DOCUMENT_MAX_BYTES, { error: "Document must be at most 4 MB." })
  .mime(["application/pdf", "image/jpeg", "image/png"], {
    error: "Only PDF, JPG or PNG documents are accepted.",
  });

export type ApplicationInput = z.infer<typeof applicationSchema>;
