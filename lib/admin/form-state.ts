// Result shape for admin server actions. Kept outside the "use server" module
// because Next forbids non-function exports there (same pattern as the auth
// and application forms).
export type AdminActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors: Record<string, string[]>;
  /** Bumped on success so uncontrolled forms can reset themselves. */
  resetKey?: number;
};

export const initialAdminActionState: AdminActionState = {
  status: "idle",
  message: "",
  fieldErrors: {},
};
