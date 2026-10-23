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

export const metadata: Metadata = { title: "My applications — PratapPass" };

export default async function RequestsHistoryPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Fstudent%2Frequests");
  }

  // Student-only surface — staff land on their dashboard until T-08 ships theirs.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "student") {
    redirect("/student");
  }

  const { data: applications, error } = await supabase
    .from("gate_pass_applications")
    .select("id, reason, status, submitted_at")
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("applications history fetch failed:", error.message, error.code);
  }

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader
        right={
          <Button render={<Link href="/student" />} variant="secondary" size="sm">
            Back to dashboard
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold">My applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every gate-pass request you have submitted, latest first.
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
            <CardDescription>
              Open an application for the full timeline, remarks, and your answers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">
                History could not be loaded — try again shortly.
              </p>
            ) : applications?.length ? (
              <ol className="divide-y">
                {applications.map((application) => (
                  <li key={application.id}>
                    <Link
                      href={`/student/requests/${application.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 hover:bg-muted/40"
                    >
                      <span className="font-medium">
                        {REASON_LABELS[application.reason]} gate pass
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Submitted {formatInstant(application.submitted_at)}
                      </span>
                      <StatusBadge status={application.status} />
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">
                  No applications yet. When you need to leave campus, submit a request
                  and it will appear here with its live status.
                </p>
                <Button render={<Link href="/student/apply" />} size="sm" className="w-fit">
                  New application
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
