"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { createUserAction } from "@/app/admin/users/actions";
import { AdminFormMessage } from "@/components/admin/form-message";
import { GeneratedPassword } from "@/components/admin/generated-password";
import { UserFields } from "@/components/admin/user-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialAdminActionState } from "@/lib/admin/form-state";
import type { DepartmentOption } from "@/lib/admin/users";
import type { AdminUserRole } from "@/lib/validation/admin";

export function UserCreateForm({ departments }: { departments: DepartmentOption[] }) {
  const [state, formAction, pending] = useActionState(
    createUserAction,
    initialAdminActionState,
  );
  const [role, setRole] = useState<AdminUserRole>("student");
  const [departmentId, setDepartmentId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const emailId = useId();

  // A successful create stays on the page (the list revalidates); clear the
  // uncontrolled inputs and return the dependent selects to their defaults.
  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setRole("student");
      setDepartmentId("");
    }
  }, [state]);

  const emailError = state.fieldErrors.email;

  return (
    <form ref={formRef} action={formAction} noValidate className="grid gap-4">
      <AdminFormMessage state={state} />

      <div className="grid gap-1.5">
        <Label htmlFor={emailId}>Email</Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="off"
          placeholder="faculty@mpgi.ac.in"
        />
        {emailError?.length ? (
          <p className="text-sm text-destructive">{emailError.join(" ")}</p>
        ) : null}
      </div>

      <UserFields
        state={state}
        departments={departments}
        role={role}
        departmentId={departmentId}
        onRoleChange={setRole}
        onDepartmentChange={setDepartmentId}
      />

      <Button type="submit" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Creating…" : "Create account"}
      </Button>

      {!pending && state.generatedPassword && state.accountEmail && (
        <GeneratedPassword email={state.accountEmail} password={state.generatedPassword} />
      )}
    </form>
  );
}
