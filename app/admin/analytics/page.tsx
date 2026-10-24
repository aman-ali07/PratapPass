import type { Metadata } from "next";

import { REASON_LABELS, StatusBadge, type AppStatus } from "@/components/student/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatInstant } from "@/lib/format";

export const metadata: Metadata = { title: "Analytics — PratapPass" };

/** The statuses that mean "no decision yet" — the same bucket the SQL counts. */
const PENDING_STATUSES: AppStatus[] = [
  "submitted",
  "under_review",
  "additional_info_required",
];

const OVERDUE_LIMIT = 10;

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${total % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${rate.toFixed(1)}%`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function AdminAnalyticsPage() {
  const { supabase } = await requireAdmin("/admin/analytics");

  const nowIso = new Date().toISOString();

  const [analyticsResult, breakdownResult, overdueResult] = await Promise.all([
    supabase.rpc("fn_admin_analytics"),
    supabase.rpc("fn_admin_analytics_breakdown"),
    supabase
      .from("gate_pass_applications")
      .select(
        "id, reason, status, expected_return_at, department:departments(code), student:profiles(full_name, roll_number)",
      )
      .in("status", PENDING_STATUSES)
      .lt("expected_return_at", nowIso)
      .order("expected_return_at", { ascending: true })
      .limit(OVERDUE_LIMIT),
  ]);

  for (const [label, error] of [
    ["analytics", analyticsResult.error],
    ["breakdown", breakdownResult.error],
    ["overdue", overdueResult.error],
  ] as const) {
    if (error) console.error(`admin ${label} fetch failed:`, error.message, error.code);
  }

  const kpi = analyticsResult.data?.[0];
  const breakdown = breakdownResult.data ?? [];
  const overdue = overdueResult.data ?? [];
  const byReason = breakdown.filter((row) => row.dimension === "reason");
  const byDepartment = breakdown.filter((row) => row.dimension === "department");
  const failed = analyticsResult.error !== null || breakdownResult.error !== null;

  return (
    <>
      <header>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Admin console
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Request volume, decisions, and processing time across the institution. Counts cover
          every application in the database; overdue means the trip window closed without a
          decision.
        </p>
      </header>

      {failed || !kpi ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          Analytics could not be loaded — refresh the page or contact the system administrator.
        </p>
      ) : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Overview</CardTitle>
            <CardDescription>
              Approved includes completed passes. Processing time runs from submission to the
              final decision, so an information request pause is included.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat label="Total requests" value={String(kpi.total_count)} />
              <Stat
                label="Awaiting decision"
                value={String(kpi.pending_count)}
                hint={`${kpi.overdue_count} past the trip window`}
              />
              <Stat
                label="Approval rate"
                value={formatRate(kpi.approval_rate)}
                hint={
                  kpi.approval_rate === null
                    ? "no decisions yet"
                    : `${kpi.approved_count} approved / ${kpi.rejected_count} rejected`
                }
              />
              <Stat
                label="Avg processing"
                value={formatDuration(kpi.avg_processing_seconds)}
                hint="submission to final decision"
              />
            </dl>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">By request type</CardTitle>
          <CardDescription>
            Every application counts once, under the type the student selected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {breakdownResult.error ? (
            <p className="text-sm text-destructive">The breakdown could not be loaded.</p>
          ) : byReason.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request type</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Awaiting</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead className="text-right">Avg processing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byReason.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell data-label="Request type" className="font-medium">
                      {REASON_LABELS[row.key as keyof typeof REASON_LABELS] ?? row.label}
                    </TableCell>
                    <TableCell data-label="Total" className="text-right tabular-nums">{row.total_count}</TableCell>
                    <TableCell data-label="Awaiting" className="text-right tabular-nums">{row.pending_count}</TableCell>
                    <TableCell data-label="Approved" className="text-right tabular-nums">{row.approved_count}</TableCell>
                    <TableCell data-label="Rejected" className="text-right tabular-nums">{row.rejected_count}</TableCell>
                    <TableCell data-label="Avg processing" className="text-right text-muted-foreground tabular-nums">
                      {formatDuration(row.avg_processing_seconds)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">By department</CardTitle>
          <CardDescription>
            The department is snapshotted when the student submits, so later transfers do not
            rewrite history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {breakdownResult.error ? (
            <p className="text-sm text-destructive">The breakdown could not be loaded.</p>
          ) : byDepartment.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Awaiting</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead className="text-right">Avg processing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDepartment.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell data-label="Department" className="font-medium">{row.label}</TableCell>
                    <TableCell data-label="Total" className="text-right tabular-nums">{row.total_count}</TableCell>
                    <TableCell data-label="Awaiting" className="text-right tabular-nums">{row.pending_count}</TableCell>
                    <TableCell data-label="Approved" className="text-right tabular-nums">{row.approved_count}</TableCell>
                    <TableCell data-label="Rejected" className="text-right tabular-nums">{row.rejected_count}</TableCell>
                    <TableCell data-label="Avg processing" className="text-right text-muted-foreground tabular-nums">
                      {formatDuration(row.avg_processing_seconds)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Overdue — past the trip window, still undecided</CardTitle>
          <CardDescription>
            {kpi && kpi.overdue_count > 0
              ? `${kpi.overdue_count} request${kpi.overdue_count === 1 ? "" : "s"} still awaiting a decision after the expected return time.${
                  kpi.overdue_count > overdue.length
                    ? ` Showing the ${overdue.length} oldest.`
                    : ""
                }`
              : "Requests still awaiting a decision after the expected return time."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overdueResult.error ? (
            <p className="text-sm text-destructive">Overdue requests could not be loaded.</p>
          ) : overdue.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No request has passed its expected return time while undecided.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Request type</TableHead>
                  <TableHead>Expected return</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdue.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell data-label="Student">
                      <div>
                        <span className="font-medium">{application.student?.full_name ?? "—"}</span>
                        <span className="block text-xs text-muted-foreground">
                          {application.student?.roll_number ?? "no roll number"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell data-label="Department">{application.department?.code ?? "—"}</TableCell>
                    <TableCell data-label="Request type">{REASON_LABELS[application.reason]}</TableCell>
                    <TableCell data-label="Expected return" className="text-muted-foreground">
                      {formatInstant(application.expected_return_at)}
                    </TableCell>
                    <TableCell data-label="Status">
                      <StatusBadge status={application.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
