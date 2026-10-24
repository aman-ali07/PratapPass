import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { UserEditForm } from "@/components/admin/user-edit-form";
import { UserPasswordResetForm } from "@/components/admin/user-password-reset";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { userRoleLabel } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatInstant } from "@/lib/format";
import { userIdSchema } from "@/lib/validation/admin";

export const metadata: Metadata = { title: "User — PratapPass" };

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin(`/admin/users/${id}`);

  const parsed = userIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  const [userResult, departmentsResult] = await Promise.all([
    supabase.rpc("fn_admin_list_users", { p_user_id: parsed.data }),
    supabase.from("departments").select("id, name, code").order("name"),
  ]);

  if (userResult.error) {
    console.error("admin user fetch failed:", userResult.error.message, userResult.error.code);
  }
  if (departmentsResult.error) {
    console.error(
      "admin departments fetch failed:",
      departmentsResult.error.message,
      departmentsResult.error.code,
    );
  }

  const user = userResult.data?.[0];
  if (!user) notFound();

  const departments = departmentsResult.data ?? [];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Admin console / Users
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{user.full_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {`${user.email} · ${userRoleLabel(user.role)} · ${
              user.department_name
                ? `${user.department_name} (${user.department_code})`
                : "No department"
            } · Created ${formatInstant(user.created_at)}`}
          </p>
        </div>
        <Button render={<Link href="/admin/users" />} variant="secondary" size="sm">
          Back to users
        </Button>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Profile and role</CardTitle>
          <CardDescription>
            Changes take effect immediately. Role or department changes are refused while the
            user owns pending approval steps or an in-flight student application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {departmentsResult.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Departments could not be loaded — editing is unavailable. Refresh the page or
              contact the system administrator.
            </p>
          ) : (
            <UserEditForm user={user} departments={departments} />
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Reset password</CardTitle>
          <CardDescription>
            Generates a new one-time password, shown once and never stored. Existing sessions
            are not revoked — the account&apos;s access token expires normally.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserPasswordResetForm userId={user.id} />
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        Accounts are never deleted: approval decisions and audit rows reference them.
        Deactivation is planned (KI-015).
      </p>
    </>
  );
}
