import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppFooter } from "@/components/layout/app-footer";
import { AppHeader } from "@/components/layout/app-header";
import { REASON_LABELS, StatusBadge } from "@/components/student/status-badge";
import { formatInstant } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/student/actions";

export const metadata: Metadata = { title: "My passes — PratapPass" };

export default async function StudentPassesPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Fstudent%2Fpasses");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  // Passes are the student surface; staff land back on /student like the
  // approver pages do for students (role mirrors, never role confusion).
  if (profile?.role !== "student") {
    redirect("/student");
  }

  // RLS: gate_passes student-own policy (0004) scopes this to the viewer's
  // own passes; the embed rides the applications read policy.
  const { data: passes, error } = await supabase
    .from("gate_passes")
    .select(
      "id, pass_code, issued_at, valid_from, expires_at, revoked_at, application:gate_pass_applications(reason, status, department:departments(code))",
    )
    .order("issued_at", { ascending: false });

  if (error) {
    console.error("passes fetch failed:", error.message, error.code);
  }

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader
        right={
          <form action={signOutAction}>
            <Button type="submit" variant="secondary" size="sm">
              Sign out
            </Button>
          </form>
        }
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <p className="text-sm text-muted-foreground">
          <Link href="/student" className="underline-offset-4 hover:underline">
            Dashboard
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">My passes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Issued automatically when every approval step completes.
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Issued gate passes</CardTitle>
            <CardDescription>
              The QR is your credential at the gate — treat it like a signature.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">
                Passes could not be loaded — try again shortly.
              </p>
            ) : passes?.length ? (
              <ol className="divide-y">
                {passes.map((pass) => (
                  <li key={pass.id} className="py-3 first:pt-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/student/passes/${pass.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {pass.application?.department?.code ?? "Pass"}{" "}
                        {REASON_LABELS[pass.application?.reason ?? "medical"]} —{" "}
                        {pass.pass_code ?? "MPGI-…"}
                      </Link>
                      <StatusBadge status={pass.application?.status ?? "approved"} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Valid {formatInstant(pass.valid_from)} until{" "}
                      {formatInstant(pass.expires_at)}
                      {pass.revoked_at && " · revoked"}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                No passes yet — approved applications receive one automatically.
              </p>
            )}
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
