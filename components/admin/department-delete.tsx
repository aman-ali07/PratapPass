"use client";

import { useActionState } from "react";

import { deleteDepartmentAction } from "@/app/admin/departments/actions";
import { Button } from "@/components/ui/button";
import { initialAdminActionState } from "@/lib/admin/form-state";

export function DepartmentDeleteForm({
  department,
}: {
  department: { id: string; name: string };
}) {
  const [state, formAction, pending] = useActionState(
    deleteDepartmentAction,
    initialAdminActionState,
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="departmentId" value={department.id} />
      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      )}
      <Button
        type="submit"
        variant="destructive"
        disabled={pending}
        className="w-full sm:w-fit"
      >
        {pending ? "Deleting…" : `Delete ${department.name}`}
      </Button>
    </form>
  );
}
