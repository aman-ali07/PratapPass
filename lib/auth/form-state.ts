// Shape of auth server-action results. Lives outside the "use server" file
// because Next forbids non-function exports there; both auth forms import
// their initial state from here (single source of truth).
export type AuthActionState = {
  status: "idle" | "error" | "needs-email-confirmation";
  message: string;
  fieldErrors: Record<string, string[]>;
};

export const initialAuthState: AuthActionState = {
  status: "idle",
  message: "",
  fieldErrors: {},
};
