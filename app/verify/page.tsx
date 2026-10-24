import type { Metadata } from "next";
import Link from "next/link";

import { signOutAction } from "@/app/student/actions";
import { AppFooter } from "@/components/layout/app-footer";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatInstant } from "@/lib/format";
import { type GateResult, isGateResult } from "@/lib/gate/results";
import {
  verifyGatePass,
  type GatePassSummary,
  type GateVerification,
} from "@/lib/gate/verify";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  gateEventSchema,
  gateProbeSchema,
  type GateEvent,
} from "@/lib/validation/gate";
import { recordGateEventAction } from "./actions";

export const metadata: Metadata = {
  title: "Verify gate pass — PratapPass",
  // The URL carries the pass credential — never let it be indexed.
  robots: { index: false, follow: false },
};

type ResultUi = {
  title: string;
  label: string;
  detail: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
};

const RESULT_UI: Record<GateResult, ResultUi> = {
  valid: {
    title: "Valid pass — allow exit",
    label: "Valid",
    detail: "The pass is inside its validity window and has not been used for an exit.",
    variant: "default",
  },
  expired: {
    title: "Pass expired",
    label: "Expired",
    detail: "The departure window has closed — do not allow exit.",
    variant: "destructive",
  },
  revoked: {
    title: "Pass revoked",
    label: "Revoked",
    detail: "This pass was revoked by the administration — do not allow exit.",
    variant: "destructive",
  },
  already_exited: {
    title: "Exit already recorded",
    label: "Already exited",
    detail: "An exit is already recorded. Record the return when the student comes back.",
    variant: "outline",
    className: "border-amber-400/60 text-amber-700 dark:text-amber-400",
  },
  already_returned: {
    title: "Trip already completed",
    label: "Returned",
    detail: "The student has returned and the application is complete.",
    variant: "secondary",
  },
  invalid_token: {
    title: "This pass is not recognised",
    label: "No pass found",
    detail: "The token or code does not match any issued pass. Do not allow entry.",
    variant: "outline",
  },
  staff_rejected: {
    title: "Pass rejected at the gate",
    label: "Rejected",
    detail: "A staff rejection is recorded for this pass.",
    variant: "destructive",
  },
};

const EXIT_STATE_LABELS: Record<GatePassSummary["exitState"], string> = {
  not_exited: "Not exited",
  exited: "Exited",
  returned: "Returned",
};

const EVENT_LABELS: Record<GateEvent, string> = {
  exit: "Exit",
  return: "Return",
  rejection: "Rejection",
};

const ERROR_COPY: Record<string, string> = {
  unauthenticated: "Your session expired — sign in and try again.",
  forbidden: "Only gate security or an administrator can record gate events.",
  record_failed:
    "The gate event could not be recorded — try again or contact the administration office.",
  invalid_request: "The recording request was malformed — rescan the pass.",
};

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function verifyHref(probe: string): string {
  return `/verify?token=${encodeURIComponent(probe)}`;
}

function recordedBanner(event: GateEvent, result: GateResult): string {
  if (result === "invalid_token") {
    return "No pass matched that reference — nothing was recorded.";
  }
  if (event === "rejection") {
    return "Rejection recorded — entry denied.";
  }
  if (event === "return" && result === "valid") {
    return "Return recorded — the application is now complete.";
  }
  if (result === "valid") {
    return `${EVENT_LABELS[event]} recorded.`;
  }
  return `${EVENT_LABELS[event]} attempt recorded — ${RESULT_UI[result].label.toLowerCase()}.`;
}

function RecordButton({
  probe,
  event,
  label,
  variant = "default",
}: {
  probe: string;
  event: GateEvent;
  label: string;
  variant?: "default" | "outline";
}) {
  return (
    <form action={recordGateEventAction}>
      <input type="hidden" name="token" value={probe} />
      <input type="hidden" name="event" value={event} />
      <Button type="submit" size="sm" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string | string[];
    recorded?: string | string[];
    error?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const rawProbe = first(params.token);
  const parsedProbe = rawProbe ? gateProbeSchema.safeParse(rawProbe) : null;
  const probe = parsedProbe?.success ? parsedProbe.data : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    role = profile?.role ?? null;
  }
  const isGateStaff = role === "security" || role === "admin";

  let verification: GateVerification | null = null;
  let verificationError: string | null = null;
  if (probe) {
    try {
      verification = await verifyGatePass(supabase, probe);
    } catch (error) {
      console.error(
        "gate verification failed:",
        error instanceof Error ? error.message : error,
      );
      verificationError = "Verification is temporarily unavailable — try again.";
    }
  }

  const probeError =
    rawProbe && parsedProbe && !parsedProbe.success
      ? (parsedProbe.error.issues[0]?.message ?? "That pass reference is not valid.")
      : null;

  const recordedRaw = first(params.recorded);
  const [recordedEventRaw, recordedResultRaw] = (recordedRaw ?? "").split(":");
  const recordedEventParsed = gateEventSchema.safeParse(recordedEventRaw ?? "");
  const recordedEvent = recordedEventParsed.success ? recordedEventParsed.data : null;
  const recordedResult =
    recordedResultRaw && isGateResult(recordedResultRaw) ? recordedResultRaw : null;
  const errorCopy = ERROR_COPY[first(params.error) ?? ""] ?? null;

  const returnTo = probe ? verifyHref(probe) : "/verify";
  const signInHref = `/login?next=${encodeURIComponent(returnTo)}`;

  const resolved =
    verification && verification.result !== "invalid_token" ? verification : null;
  const passSummary = resolved?.pass ?? null;
  const resultUi = verification ? RESULT_UI[verification.result] : null;

  const canRecordExit =
    isGateStaff &&
    resolved !== null &&
    resolved.result === "valid" &&
    resolved.pass.exitState === "not_exited";
  const canRecordReturn =
    isGateStaff &&
    resolved !== null &&
    resolved.pass.exitState === "exited" &&
    resolved.result !== "revoked";
  const canRecordRejection =
    isGateStaff && resolved !== null && resolved.result !== "already_returned";
  const canRecord = canRecordExit || canRecordReturn || canRecordRejection;

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader
        right={
          user ? (
            <form action={signOutAction}>
              <Button type="submit" variant="secondary" size="sm">
                Sign out
              </Button>
            </form>
          ) : (
            <Button render={<Link href={signInHref} />} variant="secondary" size="sm">
              Sign in
            </Button>
          )
        }
      />

      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold">Verify gate pass</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scan the QR on a student&apos;s pass or open its verification link. This
          page shows only the holder, pass code and validity window — never the
          reason, documents or health details.
        </p>

        {recordedEvent && recordedResult && (
          <p
            role="status"
            className="mt-4 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            {recordedBanner(recordedEvent, recordedResult)}
          </p>
        )}

        {errorCopy && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorCopy}
          </p>
        )}

        {probeError && (
          <Card className="mt-6 border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base">Check the pass reference</CardTitle>
              <CardDescription>{probeError}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {verificationError && (
          <Card className="mt-6 border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base">Verification unavailable</CardTitle>
              <CardDescription>{verificationError}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!rawProbe && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Scan a pass</CardTitle>
              <CardDescription>
                The QR encodes this verification link. Gate staff can also enter
                the pass code below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isGateStaff ? (
                <form action="/verify" method="get" className="flex flex-wrap items-end gap-3">
                  <label className="grid w-full gap-1 text-sm sm:w-auto">
                    <span className="font-medium">Pass code or token</span>
                    <Input
                      name="token"
                      placeholder="MPGI-XXXXXX"
                      autoComplete="off"
                      spellCheck={false}
                      required
                      className="w-full sm:w-64"
                    />
                  </label>
                  <Button type="submit">Verify</Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {user ? (
                    "Only gate security or administrators can verify by pass code."
                  ) : (
                    <>
                      Open the link from a student&apos;s QR. Gate staff can{" "}
                      <Link
                        href={signInHref}
                        className="underline underline-offset-4 hover:text-foreground"
                      >
                        sign in
                      </Link>{" "}
                      to verify by pass code.
                    </>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {verification?.result === "invalid_token" && (
          <Card className="mt-6">
            <CardHeader>
              <div>
                <Badge variant={RESULT_UI.invalid_token.variant}>
                  {RESULT_UI.invalid_token.label}
                </Badge>
              </div>
              <CardTitle className="text-base">{RESULT_UI.invalid_token.title}</CardTitle>
              <CardDescription>{RESULT_UI.invalid_token.detail}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {probe && resolved && passSummary && resultUi && (
          <Card className="mt-6">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={resultUi.variant} className={resultUi.className}>
                  {resultUi.label}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {EXIT_STATE_LABELS[passSummary.exitState]}
                </span>
              </div>
              <CardTitle className="text-xl">{resultUi.title}</CardTitle>
              <CardDescription>{resultUi.detail}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Holder</dt>
                  <dd className="font-medium">{passSummary.holderName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Department</dt>
                  <dd className="font-medium">{passSummary.department ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pass code</dt>
                  <dd className="font-mono font-medium">{passSummary.passCode ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Gate status</dt>
                  <dd className="font-medium">
                    {EXIT_STATE_LABELS[passSummary.exitState]}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Valid from</dt>
                  <dd className="font-medium">{formatInstant(passSummary.validFrom)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Valid until</dt>
                  <dd className="font-medium">{formatInstant(passSummary.expiresAt)}</dd>
                </div>
                {passSummary.revokedAt && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Revoked at</dt>
                    <dd className="font-medium">{formatInstant(passSummary.revokedAt)}</dd>
                  </div>
                )}
              </dl>

              {isGateStaff ? (
                canRecord ? (
                  <div className="mt-5 border-t pt-4">
                    <p className="font-medium">Record at the gate</p>
                    <p className="text-xs text-muted-foreground">
                      Every authenticated recording attempt is appended to the
                      verification log.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canRecordExit && (
                        <RecordButton probe={probe} event="exit" label="Record exit" />
                      )}
                      {canRecordReturn && (
                        <RecordButton probe={probe} event="return" label="Record return" />
                      )}
                      {canRecordRejection && (
                        <RecordButton
                          probe={probe}
                          event="rejection"
                          label="Record rejection"
                          variant="outline"
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">
                    No further gate action is available for this pass.
                  </p>
                )
              ) : (
                <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">
                  {user ? (
                    "Only gate security or administrators can record gate events."
                  ) : (
                    <>
                      Gate staff:{" "}
                      <Link
                        href={signInHref}
                        className="underline underline-offset-4 hover:text-foreground"
                      >
                        sign in
                      </Link>{" "}
                      to record an exit or return.
                    </>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {probe && (
          <p className="mt-6 text-sm text-muted-foreground">
            <Link
              href="/verify"
              className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground"
            >
              Verify another pass
            </Link>
          </p>
        )}
      </main>

      <AppFooter />
    </div>
  );
}
