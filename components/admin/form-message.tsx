import type { AdminActionState } from "@/lib/admin/form-state";

/** Shared status/error banner for the admin user forms. */
export function AdminFormMessage({ state }: { state: AdminActionState }) {
  if (state.status === "idle" || !state.message) return null;

  const success = state.status === "success";
  return (
    <p
      role={success ? "status" : "alert"}
      className={
        success
          ? "rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"
          : "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      }
    >
      {state.message}
    </p>
  );
}
