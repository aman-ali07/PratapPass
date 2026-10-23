// Shape of the application-submission server-action result; mirrors the auth
// form state so both forms behave identically. Outside the "use server" module
// because Next forbids non-function exports there.
export type ApplicationActionState = {
  status: "idle" | "error";
  message: string;
  fieldErrors: Record<string, string[]>;
};

export const initialApplicationState: ApplicationActionState = {
  status: "idle",
  message: "",
  fieldErrors: {},
};
