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
import { QrPassCard } from "@/components/student/qr-pass-card";
import { REASON_LABELS, StatusBadge } from "@/components/student/status-badge";
import { formatInstant } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/student/actions";

export const metadata: Metadata = { title: "Gate pass — PratapPass" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Usability state of the pass itself (distinct from the application status
 * badge): revoked/checked flows handled by fn_gate_record, expiry by clock.
 */
function PassStateLine({
  revokedAt,
  expiresAt,
}: {
  revokedAt: string | null;
  expiresAt: string;
}) {
  if (revokedAt) {
    return (
      <p className="text-sm text-destructive">
        Revoked {formatInstant(revokedAt)} — not usable at the gate.
      </p>
    );
  }
  if (Date.parse(expiresAt) < Date.now()) {
    return (
      <p className="text-sm text-destructive">
        Expired {formatInstant(expiresAt)}.
      </p>
    );
  }
  return (
    <p className="text-sm text-primary">
      Valid until {formatInstant(expiresAt)}.
    </p>
  );
}

export default async function StudentPassDetailPage({
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
    redirect(`/login?next=%2Fstudent%2Fpasses%2F${id}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, roll_number")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "student") {
    redirect("/student");
  }

  // RLS gate_passes student-own policy: an out-of-scope id arrives empty and
  // becomes a plain 404 (no existence leak, same posture as approver detail).
  const { data: pass, error } = await supabase
    .from("gate_passes")
    .select(
      "id, pass_code, issued_at, valid_from, expires_at, revoked_at, application:gate_pass_applications(reason, status, departure_at, expected_return_at, department:departments(name, code))",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("pass fetch failed:", error.message, error.code);
  }
  if (!pass || !pass.application) {
    notFound();
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

      <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <p className="no-print text-sm text-muted-foreground">
          <Link href="/student/passes" className="underline-offset-4 hover:underline">
            My passes
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {pass.pass_code ?? "Gate pass"}
          </h1>
          <StatusBadge status={pass.application.status} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your pass</CardTitle>
              <CardDescription>
                Issued {formatInstant(pass.issued_at)} when the approval chain
                completed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PassStateLine
                revokedAt={pass.revoked_at}
                expiresAt={pass.expires_at}
              />
              <div className="mt-4">
                <QrPassCard passId={pass.id} passCode={pass.pass_code} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pass details</CardTitle>
              <CardDescription>
                What gate security sees on verification — no medical data.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <p>
                <span className="text-sm text-muted-foreground">Holder: </span>
                <span className="font-medium">{profile.full_name}</span>
              </p>
              <p>
                <span className="text-sm text-muted-foreground">Roll: </span>
                <span className="font-medium">{profile.roll_number ?? "—"}</span>
              </p>
              <p>
                <span className="text-sm text-muted-foreground">Purpose: </span>
                <span className="font-medium">
                  {REASON_LABELS[pass.application.reason]}
                </span>
              </p>
              <p>
                <span className="text-sm text-muted-foreground">
                  Department:{" "}
                </span>
                <span className="font-medium">
                  {pass.application.department?.code ?? "—"}
                </span>
              </p>
              <p>
                <span className="text-sm text-muted-foreground">Departure: </span>
                <span className="font-medium">
                  {formatInstant(pass.application.departure_at)}
                </span>
              </p>
              <p>
                <span className="text-sm text-muted-foreground">Return: </span>
                <span className="font-medium">
                  {formatInstant(pass.application.expected_return_at)}
                </span>
              </p>
              <p className="sm:col-span-2">
                <span className="text-sm text-muted-foreground">
                  The QR encodes a one-time verification link; the pass shows
                  only holder, code and validity — never reasons or documents.
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
