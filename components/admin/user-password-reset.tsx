"use client";

import { useActionState } from "react";

import { resetUserPasswordAction } from "@/app/admin/users/actions";
import { AdminFormMessage } from "@/components/admin/form-message";
import { GeneratedPassword } from "@/components/admin/generated-password";
import { Button } from "@/components/ui/button";
import { initialAdminActionState } from "@/lib/admin/form-state";

export function UserPasswordResetForm({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(
    resetUserPasswordAction,
    initialAdminActionState,
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="userId" value={userId} />
      <AdminFormMessage state={state} />
      <Button type="submit" variant="outline" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Resetting…" : "Reset password"}
      </Button>
      {!pending && state.generatedPassword && state.accountEmail && (
        <GeneratedPassword email={state.accountEmail} password={state.generatedPassword} />
      )}
    </form>
  );
}
