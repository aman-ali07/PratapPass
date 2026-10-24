import type { Metadata } from "next";
import Link from "next/link";

import { DepartmentForm } from "@/components/admin/department-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Departments — PratapPass" };

const NOTICES: Record<string, string> = {
  deleted: "Department deleted.",
};

export default async function AdminDepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { supabase } = await requireAdmin("/admin/departments");
  const { notice } = await searchParams;

  const { data: departments, error } = await supabase
    .from("departments")
    .select("id, name, code, created_at")
    .order("name");

  if (error) {
    console.error("admin departments fetch failed:", error.message, error.code);
  }

  const rows = departments ?? [];
  const noticeText = notice ? NOTICES[notice] : undefined;

  return (
    <>
      <header>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Admin console
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Departments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Departments scope approvers, applications, and approval rules. The code is the
          short identifier shown on passes and verification screens.
        </p>
      </header>

      {noticeText && (
        <p
          role="status"
          className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {noticeText}
        </p>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Add a department</CardTitle>
          <CardDescription>
            The name is display copy; the code is normalized to uppercase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DepartmentForm />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">All departments</CardTitle>
          <CardDescription>
            {rows.length} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Departments could not be loaded — refresh the page or contact the system
              administrator.
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No departments yet — add the first one above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((department) => (
                  <TableRow key={department.id}>
                    <TableCell className="font-medium">{department.name}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {department.code}
                      </code>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(department.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        render={<Link href={`/admin/departments/${department.id}`} />}
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
