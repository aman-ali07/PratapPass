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
import { REASON_LABELS, STEP_ROLE_LABELS, StatusBadge, type AppStatus } from "@/components/student/status-badge";
import { formatInstant } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/student/actions";

export const metadata: Metadata = { title: "Review queue — PratapPass" };

type QueueItem = {
  applicationId: string;
  status: AppStatus;
  reason: string;
  studentName: string;
  rollNumber: string | null;
  submittedAt: string;
  stepOrder: number;
  approverRole: string;
};

export default async function ApproverQueuePage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Fapprover%2Frequests");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, department:departments(id, name)")
    .eq("id", user.id)
    .maybeSingle();
  // Approver-only surface (ARCHITECTURE §3): students/security return to their
  // own entry point; the admin console arrives with T-12.
  if (profile?.role !== "faculty" && profile?.role !== "hod") {
    redirect("/student");
  }

  // Pending steps the viewer may act on (steps RLS: assigned to me, or
  // unassigned in my department). Embedded applications are RLS-scoped too, so
  // an explicit assignment in a foreign department arrives WITHOUT an
  // application embed and is dropped — the route-level authorization still
  // runs on every detail read.
  const { data: pendingSteps, error } = await supabase
    .from("approval_steps")
    .select(
      "step_order, approver_role, application:gate_pass_applications(id, reason, status, submitted_at, student:profiles(full_name, roll_number))",
    )
    .eq("status", "pending");

  if (error) {
    console.error("approver queue fetch failed:", error.message, error.code);
  }

  // Reachable step = min pending step per application: the chain decides the
  // order, not the viewer. Meanwhile `additional_info_required` apps correctly
  // show NOTHING (their waiting step is `info_requested`) until the student
  // answers and the step resumes `pending`.
  const reachable = new Map<string, QueueItem>();
  for (const step of pendingSteps ?? []) {
    const application = step.application;
    if (!application) continue;
    const key = application.id;
    const existing = reachable.get(key);
    if (!existing || step.step_order < existing.stepOrder) {
      reachable.set(key, {
        applicationId: application.id,
        status: application.status,
        reason: REASON_LABELS[application.reason],
        studentName: application.student?.full_name ?? "Unknown applicant",
        rollNumber: application.student?.roll_number ?? null,
        submittedAt: application.submitted_at,
        stepOrder: step.step_order,
        approverRole: step.approver_role,
      });
    }
  }
  const queue = [...reachable.values()]
    .filter((item) => item.approverRole === profile.role)
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader
        right={
          <div className="flex items-center gap-2">
            <Button render={<Link href="/approver/history" />} variant="secondary" size="sm">
              History
            </Button>
            <form action={signOutAction}>
              <Button type="submit" variant="secondary" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        }
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile.department?.name ? `${profile.department.name} — ` : ""}
          applications where the chain has reached your review step.
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Pending decisions</CardTitle>
            <CardDescription>
              Open an application to see the full context and uploaded medical
              documents.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">
                The queue could not be loaded — try again shortly.
              </p>
            ) : queue.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing waiting on you right now.
              </p>
            ) : (
              <ol className="divide-y">
                {queue.map((item) => (
                  <li key={item.applicationId}>
                    <Link
                      href={`/approver/requests/${item.applicationId}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 hover:bg-muted/40"
                    >
                      <span className="grid">
                        <span className="font-medium">{item.reason} gate pass</span>
                        <span className="text-sm text-muted-foreground">
                          {item.studentName} · {item.rollNumber ?? "—"}
                        </span>
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Step {item.stepOrder} ·{" "}
                        {STEP_ROLE_LABELS[item.approverRole] ?? item.approverRole} · submitted{" "}
                        {formatInstant(item.submittedAt)}
                      </span>
                      <StatusBadge status={item.status} />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
