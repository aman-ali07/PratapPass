import type { AdminUserRole } from "@/lib/validation/admin";

/**
 * Role copy shared by the admin forms, filters, and list. `requiresDepartment`
 * mirrors the database contract in 0013: students, faculty, and HODs cannot be
 * saved without one.
 */
export const USER_ROLE_OPTIONS = [
  { value: "student", label: "Student", requiresDepartment: true },
  { value: "faculty", label: "Faculty", requiresDepartment: true },
  { value: "hod", label: "HOD", requiresDepartment: true },
  { value: "security", label: "Security", requiresDepartment: false },
  { value: "admin", label: "Administrator", requiresDepartment: false },
] as const satisfies readonly {
  value: AdminUserRole;
  label: string;
  requiresDepartment: boolean;
}[];

export function userRoleLabel(role: string): string {
  return USER_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

export type DepartmentOption = { id: string; name: string; code: string };

/** The profile fields the edit form needs (snake_case matches the RPC row). */
export type AdminUserRecord = {
  id: string;
  email: string;
  full_name: string;
  role: AdminUserRole;
  department_id: string | null;
  roll_number: string | null;
  designation: string | null;
};
