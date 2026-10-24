"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { createRuleAction, updateRuleAction } from "@/app/admin/rules/actions";
import { AdminFormMessage } from "@/components/admin/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initialAdminActionState } from "@/lib/admin/form-state";
import {
  GATE_REASON_OPTIONS,
  RULE_CHAIN_OPTIONS,
  type AdminRuleRecord,
  type DepartmentOption,
  gateReasonLabel,
  parseRuleChain,
} from "@/lib/admin/rules";
import type { GateReason, RuleChainValue } from "@/lib/validation/admin";

/**
 * One form for create and edit. The (department, reason) key is immutable once
 * created, so the edit form shows it read-only; the action re-reads the stored
 * key in Postgres rather than trusting the client.
 */
export function RuleForm({
  departments = [],
  rule,
}: {
  departments?: DepartmentOption[];
  rule?: AdminRuleRecord;
}) {
  const action = rule ? updateRuleAction : createRuleAction;
  const [state, formAction, pending] = useActionState(action, initialAdminActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const fieldId = useId();

  const [reason, setReason] = useState<GateReason>(rule?.reason ?? "medical");
  const [chain, setChain] = useState<RuleChainValue>(
    parseRuleChain(rule?.chain) ?? "faculty,hod",
  );
  const [departmentId, setDepartmentId] = useState(
    rule?.department_id ?? departments[0]?.id ?? "",
  );

  const isEmergency = reason === "emergency";
  const unsupportedChain = rule !== undefined && parseRuleChain(rule.chain) === null;

  useEffect(() => {
    if (!rule && state.status === "success") {
      formRef.current?.reset();
      setReason("medical");
      setChain("faculty,hod");
      setDepartmentId(departments[0]?.id ?? "");
    }
  }, [rule, state, departments]);

  function changeReason(value: GateReason) {
    setReason(value);
    if (value === "emergency") setChain("hod");
  }

  const fieldError = (field: string) => {
    const messages = state.fieldErrors[field];
    return messages?.length ? messages.join(" ") : null;
  };

  return (
    <form ref={formRef} action={formAction} noValidate className="grid gap-4">
      {rule && <input type="hidden" name="ruleId" value={rule.id} />}
      <AdminFormMessage state={state} />

      {rule ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Request type</Label>
            <p className="text-sm font-medium">{gateReasonLabel(rule.reason)}</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Scope</Label>
            <p className="text-sm font-medium">
              {rule.department_name
                ? `${rule.department_name} (${rule.department_code})`
                : "Global default"}
            </p>
          </div>
          <input type="hidden" name="reason" value={rule.reason} />
        </div>
      ) : (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-department`}>Department</Label>
            <input type="hidden" name="departmentId" value={departmentId} />
            <Select
              value={departmentId}
              onValueChange={(value) => setDepartmentId(String(value))}
            >
              <SelectTrigger id={`${fieldId}-department`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name} ({department.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              An override wins over the global default for this department and request type.
            </p>
            {fieldError("departmentId") && (
              <p className="text-sm text-destructive">{fieldError("departmentId")}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-reason`}>Request type</Label>
            <input type="hidden" name="reason" value={reason} />
            <Select
              value={reason}
              onValueChange={(value) => changeReason(String(value) as GateReason)}
            >
              <SelectTrigger id={`${fieldId}-reason`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GATE_REASON_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError("reason") && (
              <p className="text-sm text-destructive">{fieldError("reason")}</p>
            )}
          </div>
        </>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={`${fieldId}-chain`}>Approval chain</Label>
        <input type="hidden" name="chain" value={isEmergency ? "hod" : chain} />
        <Select
          value={isEmergency ? "hod" : chain}
          disabled={isEmergency}
          onValueChange={(value) => setChain(String(value) as RuleChainValue)}
        >
          <SelectTrigger id={`${fieldId}-chain`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RULE_CHAIN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {isEmergency
            ? "Emergency requests always route directly to the HOD — fixed by policy."
            : "Steps run in this order; the first approver must act before the next step."}
        </p>
        {unsupportedChain && (
          <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
            This rule stores a chain outside the supported presets. Saving will replace it with
            the chain shown above.
          </p>
        )}
        {fieldError("chain") && (
          <p className="text-sm text-destructive">{fieldError("chain")}</p>
        )}
      </div>

      <div className="flex items-start gap-2">
        <input
          id={`${fieldId}-medical`}
          type="checkbox"
          name="requiresMedicalDocument"
          defaultChecked={rule?.requires_medical_document ?? false}
          className="mt-1 size-4 rounded border-input accent-primary"
        />
        <div>
          <Label htmlFor={`${fieldId}-medical`}>Require a medical document</Label>
          <p className="text-xs text-muted-foreground">
            Students must attach at least one document when submitting this request type.
          </p>
          {fieldError("requiresMedicalDocument") && (
            <p className="text-sm text-destructive">
              {fieldError("requiresMedicalDocument")}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${fieldId}-validity`}>Pass validity (hours)</Label>
        <Input
          id={`${fieldId}-validity`}
          name="passValidityHours"
          type="number"
          min={1}
          max={720}
          required
          defaultValue={rule?.pass_validity_hours ?? 12}
          className="sm:max-w-40"
        />
        <p className="text-xs text-muted-foreground">
          The pass expires at the earlier of the trip end and this many hours after departure
          (1–720).
        </p>
        {fieldError("passValidityHours") && (
          <p className="text-sm text-destructive">{fieldError("passValidityHours")}</p>
        )}
      </div>

      <Button type="submit" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Saving…" : rule ? "Save changes" : "Add rule"}
      </Button>
    </form>
  );
}
