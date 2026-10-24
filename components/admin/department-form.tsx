"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import {
  createDepartmentAction,
  updateDepartmentAction,
} from "@/app/admin/departments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialAdminActionState } from "@/lib/admin/form-state";

type Department = { id: string; name: string; code: string };

/**
 * One form for both create and edit. The action is chosen by the presence of
 * a department; each page renders exactly one instance, so the hook never
 * switches actions under a mounted form.
 */
export function DepartmentForm({ department }: { department?: Department }) {
  const action = department ? updateDepartmentAction : createDepartmentAction;
  const [state, formAction, pending] = useActionState(action, initialAdminActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const fieldId = useId();

  // A successful create stays on the page so the new row is visible; clear the
  // uncontrolled inputs so the next entry starts clean.
  useEffect(() => {
    if (!department && state.status === "success") {
      formRef.current?.reset();
    }
  }, [department, state]);

  const fieldError = (field: string) => {
    const messages = state.fieldErrors[field];
    return messages?.length ? messages.join(" ") : null;
  };

  return (
    <form ref={formRef} action={formAction} noValidate className="grid gap-4">
      {department && <input type="hidden" name="departmentId" value={department.id} />}

      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      )}
      {state.status === "success" && state.message && (
        <p
          role="status"
          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {state.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <div className="grid gap-1.5">
          <Label htmlFor={`${fieldId}-name`}>Name</Label>
          <Input
            id={`${fieldId}-name`}
            name="name"
            defaultValue={department?.name}
            required
            maxLength={80}
            autoComplete="off"
            placeholder="Computer Science & Engineering"
          />
          {fieldError("name") && (
            <p className="text-sm text-destructive">{fieldError("name")}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`${fieldId}-code`}>Code</Label>
          <Input
            id={`${fieldId}-code`}
            name="code"
            defaultValue={department?.code}
            required
            maxLength={12}
            autoComplete="off"
            className="uppercase"
            placeholder="CSE"
            aria-describedby={`${fieldId}-code-hint`}
          />
          <p id={`${fieldId}-code-hint`} className="text-xs text-muted-foreground">
            2-12 characters: A-Z, 0-9 or hyphen.
          </p>
          {fieldError("code") && (
            <p className="text-sm text-destructive">{fieldError("code")}</p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Saving…" : department ? "Save changes" : "Add department"}
      </Button>
    </form>
  );
}
