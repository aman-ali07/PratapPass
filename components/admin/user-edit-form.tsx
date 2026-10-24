"use client";

import { useActionState, useId, useState } from "react";

import { updateUserAction } from "@/app/admin/users/actions";
import { AdminFormMessage } from "@/components/admin/form-message";
import { UserFields } from "@/components/admin/user-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialAdminActionState } from "@/lib/admin/form-state";
import type { AdminUserRecord, DepartmentOption } from "@/lib/admin/users";
import type { AdminUserRole } from "@/lib/validation/admin";

export function UserEditForm({
  user,
  departments,
}: {
  user: AdminUserRecord;
  departments: DepartmentOption[];
}) {
  const [state, formAction, pending] = useActionState(
    updateUserAction,
    initialAdminActionState,
  );
  const [role, setRole] = useState<AdminUserRole>(user.role);
  const [departmentId, setDepartmentId] = useState(user.department_id ?? "");
  const emailId = useId();

  return (
    <form action={formAction} noValidate className="grid gap-4">
      <input type="hidden" name="userId" value={user.id} />
      <AdminFormMessage state={state} />

      <div className="grid gap-1.5">
        <Label htmlFor={emailId}>Email</Label>
        <Input
          id={emailId}
          value={user.email}
          readOnly
          className="bg-muted"
          aria-describedby={`${emailId}-hint`}
        />
        <p id={`${emailId}-hint`} className="text-xs text-muted-foreground">
          The email identifies the sign-in account and is not editable here.
        </p>
      </div>

      <UserFields
        state={state}
        departments={departments}
        fullName={user.full_name}
        role={role}
        departmentId={departmentId}
        rollNumber={user.roll_number}
        designation={user.designation}
        onRoleChange={setRole}
        onDepartmentChange={setDepartmentId}
      />

      <Button type="submit" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
