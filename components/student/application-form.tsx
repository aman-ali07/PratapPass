"use client";

import { useActionState, useState } from "react";

import { submitApplicationAction } from "@/app/student/actions";
import { initialApplicationState } from "@/lib/application/form-state";
import { DOCUMENT_ACCEPT } from "@/lib/validation/application";
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
import { Textarea } from "@/components/ui/textarea";

const REASONS = [
  { value: "medical", label: "Medical" },
  { value: "personal", label: "Personal" },
  { value: "emergency", label: "Emergency — goes straight to the HOD" },
] as const;

/**
 * `datetime-local` values are naive local time; converting in the BROWSER
 * (before submit) bakes in the student's real UTC offset. A naive string sent
 * to the server would be parsed in the SERVER's timezone, shifting the pass
 * validity window for every non-UTC campus clock.
 */
function localToIso(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

export function ApplicationForm() {
  const [state, formAction, pending] = useActionState(
    submitApplicationAction,
    initialApplicationState,
  );
  const [reason, setReason] = useState<string>("medical");
  const [departureIso, setDepartureIso] = useState("");
  const [returnIso, setReturnIso] = useState("");

  const fieldError = (field: string) => {
    const messages = state.fieldErrors[field];
    return messages?.length ? messages.join(" ") : null;
  };

  return (
    <form action={formAction} noValidate className="grid gap-4">
      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      )}

      {/* The select is decorative for the payload; the hidden input carries the
          actual value so form semantics do not depend on kit internals. */}
      <input type="hidden" name="reason" value={reason} />
      <div className="grid gap-1.5">
        <Label htmlFor="reason">Reason</Label>
        <Select value={reason} onValueChange={(value) => setReason(String(value))}>
          <SelectTrigger id="reason" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REASONS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="departure">Departure at</Label>
          <Input
            id="departure"
            type="datetime-local"
            required
            onChange={(event) => setDepartureIso(localToIso(event.target.value))}
          />
          <input type="hidden" name="departureAt" value={departureIso} />
          {fieldError("departureAt") && (
            <p className="text-sm text-destructive">{fieldError("departureAt")}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="expectedReturn">Expected return</Label>
          <Input
            id="expectedReturn"
            type="datetime-local"
            required
            onChange={(event) => setReturnIso(localToIso(event.target.value))}
          />
          <input type="hidden" name="expectedReturnAt" value={returnIso} />
          {fieldError("expectedReturnAt") && (
            <p className="text-sm text-destructive">{fieldError("expectedReturnAt")}</p>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="explanation">Explanation</Label>
        <Textarea
          id="explanation"
          name="explanation"
          rows={4}
          required
          maxLength={2000}
          placeholder="Where are you going, and why? (Contact details for emergencies help.)"
        />
        {fieldError("explanation") && (
          <p className="text-sm text-destructive">{fieldError("explanation")}</p>
        )}
      </div>

      {reason === "medical" && (
        <div className="grid gap-1.5">
          <Label htmlFor="document">Medical document (PDF, JPG or PNG — up to 4 MB)</Label>
          <Input
            id="document"
            name="document"
            type="file"
            accept={DOCUMENT_ACCEPT}
            required
          />
          {fieldError("document") && (
            <p className="text-sm text-destructive">{fieldError("document")}</p>
          )}
          <p className="text-xs text-muted-foreground">
            The document is verified server-side before it is stored, and is only ever
            readable through short-lived links shown to your reviewers.
          </p>
        </div>
      )}

      <Button type="submit" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Submitting…" : "Submit application"}
      </Button>
    </form>
  );
}
