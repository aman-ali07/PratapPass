import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
import { ProvideInfoForm } from "@/components/student/provide-info-form";
import {
  ACTION_LABELS,
  REASON_LABELS,
  STEP_ROLE_LABELS,
  StatusBadge,
  StepBadge,
} from "@/components/student/status-badge";
import { formatBytes, formatInstant } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Application — PratapPass" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CONTENT_TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF document",
  "image/jpeg": "JPEG image",
  "image/png": "PNG image",
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Non-UUID navigation (a wrong url scrape) must 404, not poison PostgREST.
  if (!UUID_PATTERN.test(id)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=%2Fstudent%2Frequests%2F${id}`);
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

  // Own rows only — RLS empties the read for anyone else, and notFound() keeps
  // the existence of other students' applications out of the URL space.
  const { data: application, error } = await supabase
    .from("gate_pass_applications")
    .select(
      "id, reason, status, departure_at, expected_return_at, explanation, additional_info, submitted_at, decided_at, medical_documents(label, content_type, byte_size, uploaded_at), approval_steps(step_order, approver_role, status, decided_at), approval_actions(id, action, remarks, created_at, actor:profiles(full_name))",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("application detail fetch failed:", error.message, error.code);
  }
  if (!application) {
    notFound();
  }

  const steps = (application.approval_steps ?? []).sort((a, b) => a.step_order - b.step_order);
  const actions = [...(application.approval_actions ?? [])].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  const latestInfoRequest = [...actions].reverse().find((a) => a.action === "request_info");
  const awaitingStudentAnswer = application.status === "additional_info_required";

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader
        right={
          <Button render={<Link href="/student/requests" />} variant="secondary" size="sm">
            All applications
          </Button>
        }
      />

      <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {REASON_LABELS[application.reason]} gate pass
          </h1>
          <StatusBadge status={application.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Submitted {formatInstant(application.submitted_at)}
        </p>

        {awaitingStudentAnswer && (
          <div className="mt-6 rounded-md border border-amber-400/60 bg-amber-100/40 p-4 dark:bg-amber-400/10">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-400">
              A reviewer asked for more information
            </p>
            {latestInfoRequest?.remarks && (
              <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">
                “{latestInfoRequest.remarks}”
              </p>
            )}
            <div className="mt-3">
              <ProvideInfoForm applicationId={application.id} />
            </div>
          </div>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Request details</CardTitle>
            <CardDescription>Your submitted information for this request.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <p>
              <span className="text-sm text-muted-foreground">Departure: </span>
              <span className="font-medium">{formatInstant(application.departure_at)}</span>
            </p>
            <p>
              <span className="text-sm text-muted-foreground">Expected return: </span>
              <span className="font-medium">{formatInstant(application.expected_return_at)}</span>
            </p>
            <p className="sm:col-span-2">
              <span className="text-sm text-muted-foreground">Explanation: </span>
              <span className="font-medium">{application.explanation}</span>
            </p>
            {application.additional_info && (
              <p className="sm:col-span-2">
                <span className="text-sm text-muted-foreground">Your answer: </span>
                <span className="font-medium">{application.additional_info}</span>
              </p>
            )}
            {application.decided_at && (
              <p className="sm:col-span-2">
                <span className="text-sm text-muted-foreground">Final decision: </span>
                <span className="font-medium">{formatInstant(application.decided_at)}</span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Approval chain</CardTitle>
            <CardDescription>Each stage your request passes through.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="divide-y">
              {steps.map((step) => (
                <li key={step.step_order} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0">
                  <span className="text-sm text-muted-foreground">Step {step.step_order}</span>
                  <span className="font-medium">{STEP_ROLE_LABELS[step.approver_role] ?? step.approver_role}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {step.decided_at && (
                      <span className="text-xs text-muted-foreground">
                        {formatInstant(step.decided_at)}
                      </span>
                    )}
                    <StepBadge status={step.status} />
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Activity &amp; remarks</CardTitle>
            <CardDescription>
              Reviewer remarks and everything you have answered, in order.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reviewer activity yet — you will see remarks here as soon as a
                reviewer acts.
              </p>
            ) : (
              <ol className="divide-y">
                {actions.map((entry) => (
                  <li key={entry.id} className="py-2.5 first:pt-0">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium">
                        {entry.actor?.full_name ?? "Reviewer"}
                      </span>
                      <span>{ACTION_LABELS[entry.action] ?? entry.action}</span>
                    </p>
                    {entry.remarks && (
                      <p className="text-sm text-muted-foreground">“{entry.remarks}”</p>
                    )}
                    <p className="text-xs text-muted-foreground">{formatInstant(entry.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
            <CardDescription>
              Stored privately — reviewers see them through audited, short-lived
              links only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(application.medical_documents ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents attached.</p>
            ) : (
              <ol className="divide-y">
                {application.medical_documents.map((doc) => (
                  <li key={doc.label} className="py-2.5 first:pt-0">
                    <p className="text-sm font-medium">{doc.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {CONTENT_TYPE_LABELS[doc.content_type] ?? doc.content_type} ·{" "}
                      {formatBytes(doc.byte_size)} ·{" "}
                      {formatInstant(doc.uploaded_at)}
                    </p>
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
