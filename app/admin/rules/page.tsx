import type { Metadata } from "next";
import Link from "next/link";

import { RuleForm } from "@/components/admin/rule-form";
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
import {
  type AdminRuleRecord,
  gateReasonLabel,
  parseRuleChain,
  ruleChainLabel,
} from "@/lib/admin/rules";
import { requireAdmin } from "@/lib/auth/require-admin";

export const metadata: Metadata = { title: "Approval rules — PratapPass" };

const NOTICES: Record<string, string> = {
  deleted: "Department override deleted — that department now uses the global default.",
};

function RuleRows({
  rules,
  showDepartment = false,
}: {
  rules: AdminRuleRecord[];
  showDepartment?: boolean;
}) {
  return (
    <TableBody>
      {rules.map((rule) => {
        const chain = parseRuleChain(rule.chain);
        return (
          <TableRow key={rule.id}>
            {showDepartment && (
              <TableCell data-label="Department" className="font-medium">
                {rule.department_code}
              </TableCell>
            )}
            <TableCell data-label="Request type" className="font-medium">
              {gateReasonLabel(rule.reason)}
            </TableCell>
            <TableCell data-label="Chain">
              {chain ? (
                ruleChainLabel(chain)
              ) : (
                <span className="text-amber-700 dark:text-amber-300">
                  Unsupported chain
                </span>
              )}
            </TableCell>
            <TableCell data-label="Medical document">
              {rule.requires_medical_document ? "Required" : "Not required"}
            </TableCell>
            <TableCell data-label="Pass validity" className="text-muted-foreground">
              {`${rule.pass_validity_hours} h`}
            </TableCell>
            <TableCell data-label="Actions" className="text-right">
              <Button
                render={<Link href={`/admin/rules/${rule.id}`} />}
                variant="outline"
                size="sm"
              >
                Edit
              </Button>
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  );
}

export default async function AdminRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { supabase } = await requireAdmin("/admin/rules");
  const { notice } = await searchParams;

  const [rulesResult, departmentsResult] = await Promise.all([
    supabase.rpc("fn_admin_list_rules"),
    supabase.from("departments").select("id, name, code").order("name"),
  ]);

  if (rulesResult.error) {
    console.error("admin rules fetch failed:", rulesResult.error.message, rulesResult.error.code);
  }
  if (departmentsResult.error) {
    console.error(
      "admin departments fetch failed:",
      departmentsResult.error.message,
      departmentsResult.error.code,
    );
  }

  const rules = rulesResult.data ?? [];
  const departments = departmentsResult.data ?? [];
  const globalRules = rules.filter((rule) => rule.department_id === null);
  const overrides = rules.filter((rule) => rule.department_id !== null);
  const noticeText = notice ? NOTICES[notice] : undefined;

  return (
    <>
      <header>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Admin console
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Approval rules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose the approval chain, medical-document requirement, and pass validity for each
          request type. A department override wins over the global default; emergency requests
          always route directly to the HOD.
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
          <CardTitle className="text-base">Global defaults</CardTitle>
          <CardDescription>
            Every request type falls back to these. They can be edited but never deleted, so a
            submission always finds a rule. Emergency is fixed to a single HOD step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rulesResult.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Rules could not be loaded — refresh the page or contact the system administrator.
            </p>
          ) : globalRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No global defaults are configured — contact the system administrator.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request type</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Medical document</TableHead>
                  <TableHead>Pass validity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <RuleRows rules={globalRules} />
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Department overrides</CardTitle>
          <CardDescription>
            Overrides apply only to the selected department. Deleting one reverts that department
            to the global default; applications already submitted keep the chain they were
            created with.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rulesResult.error ? null : overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No department overrides yet — every department uses the global defaults.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead>Request type</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Medical document</TableHead>
                  <TableHead>Pass validity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <RuleRows rules={overrides} showDepartment />
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Add a department override</CardTitle>
          <CardDescription>
            Only one rule can exist per department and request type. To change an existing
            override, edit it from the table above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {departmentsResult.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Departments could not be loaded — adding an override is unavailable. Refresh the
              page or contact the system administrator.
            </p>
          ) : departments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No departments are configured yet.{" "}
              <Link href="/admin/departments" className="font-medium underline underline-offset-4">
                Add a department
              </Link>{" "}
              before creating an override.
            </p>
          ) : (
            <RuleForm departments={departments} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
