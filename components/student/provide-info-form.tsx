"use client";

import { useActionState } from "react";

import { answerAdditionalInfoAction } from "@/app/student/requests/[id]/actions";
import { initialApplicationState } from "@/lib/application/form-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Routed to `fn_provide_info` under the session; the application id travels in
 * the hidden input because the SECURITY DEFINER function still re-checks that
 * the caller owns the application and that its state accepts an answer.
 */
export function ProvideInfoForm({ applicationId }: { applicationId: string }) {
  const [state, formAction, pending] = useActionState(
    answerAdditionalInfoAction,
    initialApplicationState,
  );

  return (
    <form action={formAction} noValidate className="grid gap-3">
      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      )}

      <input type="hidden" name="applicationId" value={applicationId} />

      <div className="grid gap-1.5">
        <Label htmlFor="info-answer">Your answer</Label>
        <Textarea
          id="info-answer"
          name="text"
          rows={4}
          required
          maxLength={2000}
          placeholder="Answer the reviewer's question here — for example, attach context or give the missing details."
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Sending…" : "Send answer"}
      </Button>
    </form>
  );
}
