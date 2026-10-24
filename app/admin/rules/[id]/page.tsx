import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RuleDeleteForm } from "@/components/admin/rule-delete";
import { RuleForm } from "@/components/admin/rule-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { gateReasonLabel, parseRuleChain, ruleChainLabel } from "@/lib/admin/rules";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatInstant } from "@/lib/format";
import { ruleIdSchema } from "@/lib/validation/admin";

export const metadata: Metadata = { title: "Approval rule — PratapPass" };

export default async function AdminRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin(`/admin/rules/${id}`);

  const parsed = ruleIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  const { data: rules, error } = await supabase.rpc("fn_admin_list_rules", {
    p_rule_id: parsed.data,
  });

  if (error) {
    console.error("admin rule fetch failed:", error.message, error.code);
  }
  const rule = rules?.[0];
  if (!rule) notFound();

  const chain = parseRuleChain(rule.chain);
  const isGlobal = rule.department_id === null;
  const scope = isGlobal
    ? "Global default"
    : `${rule.department_name} (${rule.department_code})`;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Admin console / Approval rules
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            {gateReasonLabel(rule.reason)} · {scope}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {chain ? ruleChainLabel(chain) : "Unsupported chain"} · Created{" "}
            {formatInstant(rule.created_at)} · Updated {formatInstant(rule.updated_at)}
          </p>
        </div>
        <Button render={<Link href="/admin/rules" />} variant="secondary" size="sm">
          Back to rules
        </Button>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Edit rule</CardTitle>
          <CardDescription>
            The department and request type identify the rule and cannot be changed here. To move
            a rule, create the new scope and delete this override.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RuleForm rule={rule} />
        </CardContent>
      </Card>

      {isGlobal ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Global default</CardTitle>
            <CardDescription>
              Global defaults cannot be deleted — every request type must always have a fallback
              rule. Edit the chain, document requirement, or validity above instead.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Delete department override
            </CardTitle>
            <CardDescription>
              Deleting this override reverts {scope} to the global default. Applications already
              submitted keep the approval steps they were created with.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RuleDeleteForm
              rule={{ id: rule.id, label: `${gateReasonLabel(rule.reason)} (${rule.department_code})` }}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
