"use client";

import { useActionState } from "react";

import { deleteRuleAction } from "@/app/admin/rules/actions";
import { Button } from "@/components/ui/button";
import { initialAdminActionState } from "@/lib/admin/form-state";

export function RuleDeleteForm({ rule }: { rule: { id: string; label: string } }) {
  const [state, formAction, pending] = useActionState(
    deleteRuleAction,
    initialAdminActionState,
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="ruleId" value={rule.id} />
      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      )}
      <Button
        type="submit"
        variant="destructive"
        disabled={pending}
        className="w-full sm:w-fit"
      >
        {pending ? "Deleting…" : `Delete ${rule.label}`}
      </Button>
    </form>
  );
}
