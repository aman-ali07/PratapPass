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
import { ACTION_LABELS, REASON_LABELS, StatusBadge } from "@/components/student/status-badge";
import { formatInstant } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/student/actions";

export const metadata: Metadata = { title: "Decision history — PratapPass" };

/**
 * Processing time = submit → decision as recorded by the action row
 * (per-decision, not per-application: a chain may resolve across days).
 */
function processingTime(submittedAt: string, decidedAt: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(decidedAt) - Date.parse(submittedAt)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

export default async function ApproverHistoryPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Fapprover%2Fhistory");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, department:departments(id, name)")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "faculty" && profile?.role !== "hod") {
    redirect("/student");
  }

  // The reviewer's OWN recorded decisions (append-only history via RLS dept
  // scope, narrowed to the actor for accountability — department-wide overviews
  // belong to the admin analytics slice, T-13).
  const { data: decisions, error } = await supabase
    .from("approval_actions")
    .select(
      "id, action, remarks, created_at, application:gate_pass_applications(id, reason, status, submitted_at, student:profiles(full_name, roll_number))",
    )
    .eq("actor_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("decision history fetch failed:", error.message, error.code);
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
        <h1 className="text-2xl font-semibold">Decision history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile.department?.name ? `${profile.department.name} — ` : ""}
          every decision you recorded, immutable and timestamped.
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Recorded decisions</CardTitle>
            <CardDescription>
              Processing time is counted from the student&apos;s submission to
              this decision.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">
                History could not be loaded — try again shortly.
              </p>
            ) : decisions?.length ? (
              <ol className="divide-y">
                {decisions.map((entry) => {
                  const application = entry.application;
                  // Embedded rows can be absent under scope drift; render nothing.
                  if (!application) return null;
                  return (
                    <li key={entry.id} className="py-3 first:pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          href={`/approver/requests/${application.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {REASON_LABELS[application.reason]} gate pass
                        </Link>
                        <span className="text-sm text-muted-foreground">
                          {ACTION_LABELS[entry.action] ?? entry.action} ·{" "}
                          {processingTime(application.submitted_at, entry.created_at)}
                        </span>
                        <StatusBadge status={application.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {application.student?.full_name ?? "Unknown applicant"} ·{" "}
                        {application.student?.roll_number ?? "—"} ·{" "}
                        {formatInstant(entry.created_at)}
                      </p>
                      {entry.remarks && (
                        <p className="text-sm text-muted-foreground">“{entry.remarks}”</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                No decisions recorded yet — approved or reviewed applications
                will appear here as they happen.
              </p>
            )}
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
