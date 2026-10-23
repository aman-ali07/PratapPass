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
import {
  ACTION_LABELS,
  REASON_LABELS,
  STEP_ROLE_LABELS,
  StatusBadge,
  StepBadge,
} from "@/components/student/status-badge";
import { formatBytes, formatInstant } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/student/actions";

export const metadata: Metadata = { title: "Review application — PratapPass" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTENT_TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF document",
  "image/jpeg": "JPEG image",
  "image/png": "PNG image",
};

export default async function ApproverDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Non-UUID scraping must 404, not reach PostgREST.
  if (!UUID_PATTERN.test(id)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=%2Fapprover%2Frequests%2F${id}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, department:departments(id, name)")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "faculty" && profile?.role !== "hod") {
    redirect("/student");
  }

  // RLS scopes this read to the viewer's department — an out-of-scope id comes
  // back empty and becomes a plain 404 (acceptance: no existence leak).
  const { data: application, error } = await supabase
    .from("gate_pass_applications")
    .select(
      "id, department_id, reason, status, departure_at, expected_return_at, explanation, additional_info, submitted_at, student:profiles(full_name, roll_number), medical_documents(id, label, content_type, byte_size, uploaded_at), approval_steps(step_order, approver_role, status, decided_at), approval_actions(id, action, remarks, created_at, actor:profiles(full_name))",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("approver detail fetch failed:", error.message, error.code);
  }
  if (!application) {
    notFound();
  }

  const steps = [...(application.approval_steps ?? [])].sort(
    (a, b) => a.step_order - b.step_order,
  );
  const actions = [...(application.approval_actions ?? [])].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );

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
          <Link href="/approver/requests" className="underline-offset-4 hover:underline">
            Review queue
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {REASON_LABELS[application.reason]} gate pass
          </h1>
          <StatusBadge status={application.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {application.student?.full_name ?? "Unknown applicant"} ·{" "}
          {application.student?.roll_number ?? "—"} · submitted{" "}
          {formatInstant(application.submitted_at)}
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Request details</CardTitle>
            <CardDescription>The applicant&apos;s own statement of purpose.</CardDescription>
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
                <span className="text-sm text-muted-foreground">Applicant&apos;s answer: </span>
                <span className="font-medium">{application.additional_info}</span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Uploaded documents</CardTitle>
            <CardDescription>
              Opened through audited, ≤5-minute signed links — every preview is
              logged with your identity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(application.medical_documents ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents attached.</p>
            ) : (
              <ol className="divide-y">
                {application.medical_documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0"
                  >
                    <span className="grid">
                      <span className="text-sm font-medium">{doc.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {CONTENT_TYPE_LABELS[doc.content_type] ?? doc.content_type} ·{" "}
                        {formatBytes(doc.byte_size)} · {formatInstant(doc.uploaded_at)}
                      </span>
                    </span>
                    <Button
                      render={
                        <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener" />
                      }
                      variant="outline"
                      size="sm"
                    >
                      Preview
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Approval chain</CardTitle>
            <CardDescription>Where this request currently stands.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="divide-y">
              {steps.map((step) => (
                <li
                  key={step.step_order}
                  className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0"
                >
                  <span className="text-sm text-muted-foreground">Step {step.step_order}</span>
                  <span className="font-medium">
                    {STEP_ROLE_LABELS[step.approver_role] ?? step.approver_role}
                  </span>
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
            <CardDescription>Immutable history of everything so far.</CardDescription>
          </CardHeader>
          <CardContent>
            {actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reviewer activity on this application yet.
              </p>
            ) : (
              <ol className="divide-y">
                {actions.map((entry) => (
                  <li key={entry.id} className="py-2.5 first:pt-0">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium">{entry.actor?.full_name ?? "Reviewer"}</span>
                      <span>{ACTION_LABELS[entry.action] ?? entry.action}</span>
                    </p>
                    {entry.remarks && (
                      <p className="text-sm text-muted-foreground">“{entry.remarks}”</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatInstant(entry.created_at)}
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
