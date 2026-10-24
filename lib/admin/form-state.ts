// Result shape for admin server actions. Kept outside the "use server" module
// because Next forbids non-function exports there (same pattern as the auth
// and application forms).
export type AdminActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors: Record<string, string[]>;
  /** Bumped on success so uncontrolled forms can reset themselves. */
  resetKey?: number;
  /**
   * A generated credential shown exactly once (D-020). It is returned in the
   * action result for the admin to hand over; it is never persisted, logged,
   * or written to audit metadata.
   */
  generatedPassword?: string;
  /** Email the credential belongs to — display context, not a secret. */
  accountEmail?: string;
};

export const initialAdminActionState: AdminActionState = {
  status: "idle",
  message: "",
  fieldErrors: {},
};
