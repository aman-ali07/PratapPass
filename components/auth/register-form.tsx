"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUpStudent } from "@/app/(auth)/actions";
import { initialAuthState } from "@/lib/auth/form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELD_LABELS = {
  fullName: "Full name",
  rollNumber: "Roll number",
  email: "Email",
  password: "Password",
} as const;

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(signUpStudent, initialAuthState);

  const fieldError = (field: keyof typeof FIELD_LABELS) => state.fieldErrors[field];

  if (state.status === "needs-email-confirmation") {
    return (
      <div className="grid gap-3 text-center" role="status">
        <p className="text-sm text-foreground">{state.message}</p>
        <p className="text-sm text-muted-foreground">
          Once confirmed, you can{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            sign in
          </Link>{" "}
          with your email and password.
        </p>
      </div>
    );
  }

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

      <div className="grid gap-1.5">
        <Label htmlFor="fullName">{FIELD_LABELS.fullName}</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
          aria-invalid={Boolean(fieldError("fullName"))}
        />
        {fieldError("fullName") && (
          <p className="text-xs text-destructive">{fieldError("fullName")}</p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="rollNumber">{FIELD_LABELS.rollNumber}</Label>
        <Input
          id="rollNumber"
          name="rollNumber"
          autoComplete="off"
          required
          minLength={3}
          maxLength={20}
          aria-describedby="rollNumber-hint"
          aria-invalid={Boolean(fieldError("rollNumber"))}
        />
        <p id="rollNumber-hint" className="text-xs text-muted-foreground">
          Your institutional roll number (used to link the application to your department).
        </p>
        {fieldError("rollNumber") && (
          <p className="text-xs text-destructive">{fieldError("rollNumber")}</p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="email">{FIELD_LABELS.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(fieldError("email"))}
        />
        {fieldError("email") && <p className="text-xs text-destructive">{fieldError("email")}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="password">{FIELD_LABELS.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          aria-invalid={Boolean(fieldError("password"))}
        />
        {fieldError("password") && (
          <p className="text-xs text-destructive">{fieldError("password")}</p>
        )}
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create student account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
