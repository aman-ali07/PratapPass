"use client";

import { useActionState, useState } from "react";

import { decideApplicationAction } from "@/app/approver/actions";
import { initialApplicationState } from "@/lib/application/form-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const ACTIONS = [
  { value: "approve", label: "Approve", hint: "Passes this step" },
  { value: "request_info", label: "Request info", hint: "Paused until the student answers" },
  { value: "reject", label: "Reject", hint: "Ends the application" },
] as const;

type DecisionAction = (typeof ACTIONS)[number]["value"];

/**
 * Rendered only when the reachable pending step belongs to the viewing role,
 * but `fn_decide_application` remains the authority — a stale double-submit is
 * caught server-side and surfaces as the re-sync banner, not a broken action.
 */
export function DecisionPanel({ applicationId }: { applicationId: string }) {
  const [state, formAction, pending] = useActionState(
    decideApplicationAction,
    initialApplicationState,
  );
  const [selected, setSelected] = useState<DecisionAction>("approve");
  const wantsRemarks = selected !== "approve";
  const remarksError = state.fieldErrors.remarks?.join(" ");

  return (
    <form action={formAction} noValidate className="grid gap-3">
      {state.status === "error" && state.message && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      )}

      <input type="hidden" name="applicationId" value={applicationId} />

      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">Decision</legend>
        {ACTIONS.map((option) => (
          <label
            key={option.value}
            className={
              selected === option.value
                ? "flex cursor-pointer flex-col rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm"
                : "flex cursor-pointer flex-col rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            }
          >
            <input
              type="radio"
              name="action"
              value={option.value}
              checked={selected === option.value}
              onChange={() => setSelected(option.value)}
              className="sr-only"
            />
            <span className="font-medium">{option.label}</span>
            <span className="text-xs text-muted-foreground">{option.hint}</span>
          </label>
        ))}
      </fieldset>

      {wantsRemarks && (
        <div className="grid gap-1.5">
          <Label htmlFor="decision-remarks">Remarks (required)</Label>
          <Textarea
            id="decision-remarks"
            name="remarks"
            rows={3}
            required
            maxLength={1000}
            placeholder={
              selected === "reject"
                ? "State the reason for rejecting this request."
                : "State exactly what the student should provide."
            }
          />
          {remarksError && <p className="text-sm text-destructive">{remarksError}</p>}
        </div>
      )}

      <Button type="submit" disabled={pending} className="w-full sm:w-fit">
        {pending
          ? "Recording…"
          : selected === "approve"
            ? "Approve this step"
            : selected === "reject"
              ? "Reject application"
              : "Send information request"}
      </Button>
    </form>
  );
}
