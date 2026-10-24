"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * One-time credential panel (D-020). The password lives only in the action
 * result held by the form; nothing here persists or logs it.
 */
export function GeneratedPassword({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setCopyState("copied");
    } catch {
      // Clipboard permission/secure-context failures are recoverable by hand.
      setCopyState("failed");
    }
  }

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        One-time password for {email}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="select-all rounded bg-background px-2 py-1 font-mono text-sm ring-1 ring-foreground/10">
          {password}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copyPassword}>
          Copy
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Shown once and never stored. Hand it over out-of-band; an admin can reset it if it is
        lost.
      </p>
      {copyState === "copied" && (
        <p role="status" className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
          Copied.
        </p>
      )}
      {copyState === "failed" && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          Copy failed — select the password manually.
        </p>
      )}
    </div>
  );
}
