import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DepartmentDeleteForm } from "@/components/admin/department-delete";
import { DepartmentForm } from "@/components/admin/department-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatInstant } from "@/lib/format";
import { departmentIdSchema } from "@/lib/validation/admin";

export const metadata: Metadata = { title: "Department — PratapPass" };

export default async function AdminDepartmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin(`/admin/departments/${id}`);

  const parsed = departmentIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  const { data: department, error } = await supabase
    .from("departments")
    .select("id, name, code, created_at, updated_at")
    .eq("id", parsed.data)
    .maybeSingle();

  if (error) {
    console.error("admin department fetch failed:", error.message, error.code);
  }
  if (!department) notFound();

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Admin console / Departments
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{department.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Code{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {department.code}
            </code>{" "}
            · Created {formatInstant(department.created_at)} · Updated{" "}
            {formatInstant(department.updated_at)}
          </p>
        </div>
        <Button render={<Link href="/admin/departments" />} variant="secondary" size="sm">
          Back to departments
        </Button>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Edit department</CardTitle>
          <CardDescription>
            Changing the code does not rewrite historical passes or applications — they keep
            the code recorded when they were created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DepartmentForm department={department} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Delete department</CardTitle>
          <CardDescription>
            Deletion is permanent. It is only allowed when no profiles, applications,
            approval steps, or approval rules reference this department.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Reassign people and remove configuration first. The database will list any
            remaining references if you try.
          </p>
          <DepartmentDeleteForm department={department} />
        </CardContent>
      </Card>
    </>
  );
}
