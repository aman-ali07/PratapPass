"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminActionState } from "@/lib/admin/form-state";
import { USER_ROLE_OPTIONS, type DepartmentOption } from "@/lib/admin/users";
import type { AdminUserRole } from "@/lib/validation/admin";

/**
 * Shared profile fields for create/edit. The role and department selects are
 * controlled (so dependent fields can appear) and mirror their value into a
 * hidden input for the native form submission.
 */
export function UserFields({
  state,
  departments,
  fullName,
  role,
  departmentId,
  rollNumber,
  designation,
  onRoleChange,
  onDepartmentChange,
}: {
  state: AdminActionState;
  departments: DepartmentOption[];
  fullName?: string;
  role: AdminUserRole;
  departmentId: string;
  rollNumber?: string | null;
  designation?: string | null;
  onRoleChange: (role: AdminUserRole) => void;
  onDepartmentChange: (departmentId: string) => void;
}) {
  const id = useId();
  const requiresDepartment = role === "student" || role === "faculty" || role === "hod";

  const fieldError = (field: string) => {
    const messages = state.fieldErrors[field];
    return messages?.length ? messages.join(" ") : null;
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-fullName`}>Full name</Label>
        <Input
          id={`${id}-fullName`}
          name="fullName"
          defaultValue={fullName}
          required
          maxLength={80}
          autoComplete="off"
          placeholder="Dr. Asha Verma"
        />
        {fieldError("fullName") && (
          <p className="text-sm text-destructive">{fieldError("fullName")}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-role`}>Role</Label>
          <input type="hidden" name="role" value={role} />
          <Select
            value={role}
            onValueChange={(value) => onRoleChange(String(value) as AdminUserRole)}
          >
            <SelectTrigger id={`${id}-role`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USER_ROLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-department`}>Department</Label>
          <input type="hidden" name="departmentId" value={departmentId} />
          <Select
            value={departmentId || "none"}
            onValueChange={(value) =>
              onDepartmentChange(String(value) === "none" ? "" : String(value))
            }
          >
            <SelectTrigger id={`${id}-department`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled={requiresDepartment}>
                No department
              </SelectItem>
              {departments.map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.name} ({department.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {requiresDepartment ? "Required for this role." : "Optional for this role."}
          </p>
          {fieldError("departmentId") && (
            <p className="text-sm text-destructive">{fieldError("departmentId")}</p>
          )}
        </div>
      </div>

      {role === "student" ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-roll`}>Roll number</Label>
          <Input
            id={`${id}-roll`}
            name="rollNumber"
            defaultValue={rollNumber ?? ""}
            required
            maxLength={20}
            autoComplete="off"
            className="uppercase"
            placeholder="24MPGI0001"
            aria-describedby={`${id}-roll-hint`}
          />
          <p id={`${id}-roll-hint`} className="text-xs text-muted-foreground">
            3-20 letters or digits; stored uppercase.
          </p>
          {fieldError("rollNumber") && (
            <p className="text-sm text-destructive">{fieldError("rollNumber")}</p>
          )}
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-designation`}>Designation</Label>
          <Input
            id={`${id}-designation`}
            name="designation"
            defaultValue={designation ?? ""}
            maxLength={80}
            autoComplete="off"
            placeholder="Assistant Professor"
          />
          {fieldError("designation") && (
            <p className="text-sm text-destructive">{fieldError("designation")}</p>
          )}
        </div>
      )}
    </div>
  );
}
