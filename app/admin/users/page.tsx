import type { Metadata } from "next";
import Link from "next/link";

import { UserCreateForm } from "@/components/admin/user-create-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { USER_ROLE_OPTIONS, userRoleLabel } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { userSearchSchema } from "@/lib/validation/admin";

export const metadata: Metadata = { title: "Users — PratapPass" };

const ROLE_FILTERS = [
  { value: "", label: "All" },
  ...USER_ROLE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const { supabase } = await requireAdmin("/admin/users");
  const params = await searchParams;
  const { q, role: roleParam } = userSearchSchema.parse(params);
  const role = roleParam === "" ? null : roleParam;

  const [usersResult, departmentsResult] = await Promise.all([
    supabase.rpc("fn_admin_list_users", {
      p_search: q || undefined,
      p_role: role ?? undefined,
    }),
    supabase.from("departments").select("id, name, code").order("name"),
  ]);

  if (usersResult.error) {
    console.error("admin users fetch failed:", usersResult.error.message, usersResult.error.code);
  }
  if (departmentsResult.error) {
    console.error(
      "admin departments fetch failed:",
      departmentsResult.error.message,
      departmentsResult.error.code,
    );
  }

  const users = usersResult.data ?? [];
  const departments = departmentsResult.data ?? [];
  const total = users[0]?.total_count ?? 0;

  return (
    <>
      <header>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Admin console
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Provision student and staff accounts, change roles and departments, and reset
          passwords. Every change is audited; accounts are never deleted because approvals and
          audit history reference them.
        </p>
      </header>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Add a user</CardTitle>
          <CardDescription>
            The account is created with a generated one-time password. Share it with the user
            out-of-band — it is not emailed and cannot be retrieved later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {departmentsResult.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Departments could not be loaded — account creation is unavailable. Refresh the
              page or contact the system administrator.
            </p>
          ) : departments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No departments are configured yet.{" "}
              <Link href="/admin/departments" className="font-medium underline underline-offset-4">
                Add a department
              </Link>{" "}
              before creating students, faculty, or HODs.
            </p>
          ) : (
            <UserCreateForm departments={departments} />
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">All users</CardTitle>
          <CardDescription>
            {`${total} account${total === 1 ? "" : "s"}${
              users.length < total
                ? ` — showing the first ${users.length}; refine the search`
                : ""
            }`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {role && <input type="hidden" name="role" value={role} />}
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search name, roll number, or email"
              aria-label="Search users"
              className="sm:max-w-sm"
            />
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" size="sm">
                Search
              </Button>
              {(q || role) && (
                <Button render={<Link href="/admin/users" />} variant="ghost" size="sm">
                  Clear
                </Button>
              )}
            </div>
          </form>

          <div className="flex flex-wrap gap-1 rounded-lg bg-muted/40 p-1">
            {ROLE_FILTERS.map((filter) => {
              const active = (role ?? "") === filter.value;
              const next = new URLSearchParams();
              if (q) next.set("q", q);
              if (filter.value) next.set("role", filter.value);
              const query = next.toString();
              return (
                <Link
                  key={filter.value || "all"}
                  href={query ? `/admin/users?${query}` : "/admin/users"}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
                    active && "bg-background text-foreground shadow-sm ring-1 ring-foreground/10",
                  )}
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>

          {usersResult.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Users could not be loaded — refresh the page or contact the system administrator.
            </p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No users match this search.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Roll</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium">{user.full_name}</div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </TableCell>
                    <TableCell>{userRoleLabel(user.role)}</TableCell>
                    <TableCell>{user.roll_number || "—"}</TableCell>
                    <TableCell>{user.department_code || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        render={<Link href={`/admin/users/${user.id}`} />}
                        variant="outline"
                        size="sm"
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
