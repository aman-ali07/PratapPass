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
import { DashboardPoll } from "@/components/student/dashboard-poll";
import { REASON_LABELS, StatusBadge } from "@/components/student/status-badge";
import { formatInstant } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { markNotificationsReadAction, signOutAction } from "./actions";

export const metadata: Metadata = { title: "My dashboard — PratapPass" };

export default async function StudentDashboard({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; notifications?: string }>;
}) {
  const { submitted, notifications: notificationsBanner } = await searchParams;

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Fstudent");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, roll_number, role, department:departments(id, name)")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // Server-side only: PostgREST messages can carry policy/table internals.
    console.error("student profile fetch failed:", error.message, error.code);
  }

  // Summary + live status come from the student's own rows under RLS; staff
  // roles landing here see honest empty cards until T-08 replaces their view.
  const { data: applications, error: applicationsError } = await supabase
    .from("gate_pass_applications")
    .select("id, reason, status, submitted_at")
    .order("submitted_at", { ascending: false })
    .limit(5);

  if (applicationsError) {
    console.error("student applications fetch failed:", applicationsError.message, applicationsError.code);
  }

  const { data: recentNotifications, error: notificationsError } = await supabase
    .from("notifications")
    .select("id, title, body, read_at, created_at, application_id")
    .order("created_at", { ascending: false })
    .limit(5);

  if (notificationsError) {
    console.error("student notifications fetch failed:", notificationsError.message, notificationsError.code);
  }

  const { count: unreadCount, error: unreadError } = await supabase
    .from("notifications")
    .select("id", { count: "exact" })
    .is("read_at", null);

  if (unreadError) {
    console.error("unread notification count failed:", unreadError.message, unreadError.code);
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold">My dashboard</h1>
        <DashboardPoll />

        {submitted && (
          <p
            role="status"
            className="mt-4 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            Application received — your approval chain is queued. You will be
            notified when a reviewer acts on it.
          </p>
        )}
        {notificationsBanner === "read" && (
          <p
            role="status"
            className="mt-4 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            All notifications marked as read.
          </p>
        )}
        {notificationsBanner === "error" && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            Notifications could not be marked as read — try again.
          </p>
        )}

        {error || !profile ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base text-destructive">Profile unavailable</CardTitle>
              <CardDescription>
                Try signing out and back in; contact the administration if this persists.
              </CardDescription>
              <p className="sr-only">Profile lookup failed for email {user.email}.</p>
            </CardHeader>
          </Card>
        ) : (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Account</CardTitle>
              <CardDescription>Your institutional identity in PratapPass.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <p>
                <span className="text-sm text-muted-foreground">Name: </span>
                <span className="font-medium">{profile.full_name}</span>
              </p>
              <p>
                <span className="text-sm text-muted-foreground">Email: </span>
                <span className="font-medium">{user.email}</span>
              </p>
              <p>
                <span className="text-sm text-muted-foreground">Roll number: </span>
                <span className="font-medium">{profile.roll_number ?? "—"}</span>
              </p>
              <p>
                <span className="text-sm text-muted-foreground">Role: </span>
                <span className="font-medium">{profile.role}</span>
              </p>
              <p className="sm:col-span-2">
                <span className="text-sm text-muted-foreground">Department: </span>
                <span className="font-medium">{profile.department?.name ?? "Unassigned"}</span>
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Gate-pass applications</CardTitle>
            <CardDescription>
              Live status of your requests — the full history and per-application
              timeline live under “Applications”.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {applicationsError ? (
              <p className="text-sm text-destructive">
                Applications could not be loaded — try again shortly.
              </p>
            ) : applications?.length ? (
              <ol className="divide-y">
                {applications.map((app) => (
                  <li key={app.id}>
                    <Link
                      href={`/student/requests/${app.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 hover:bg-muted/40"
                    >
                      <span className="font-medium">{REASON_LABELS[app.reason]}</span>
                      <span className="text-sm text-muted-foreground">
                        Submitted {formatInstant(app.submitted_at)}
                      </span>
                      <StatusBadge status={app.status} />
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                No applications yet — submit your first one whenever you need to leave campus.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {profile?.role === "student" && (
                <Button render={<Link href="/student/apply" />} size="sm">
                  New application
                </Button>
              )}
              <Button render={<Link href="/student/requests" />} variant="secondary" size="sm">
                Applications
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
            <CardDescription>
              {typeof unreadCount === "number"
                ? unreadCount === 0
                  ? "Nothing unread."
                  : `${unreadCount} unread`
                : undefined}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {notificationsError ? (
              <p className="text-sm text-destructive">
                Notifications could not be loaded — try again shortly.
              </p>
            ) : recentNotifications?.length ? (
              <ol className="divide-y">
                {recentNotifications.map((note) => {
                  const inner = (
                    <>
                      <p className="flex items-center gap-2 text-sm">
                        {note.read_at === null && (
                          <span
                            aria-label="Unread"
                            className="inline-block size-1.5 shrink-0 rounded-full bg-primary"
                          />
                        )}
                        <span className={note.read_at === null ? "font-medium" : ""}>
                          {note.title}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">{note.body}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatInstant(note.created_at)}
                      </p>
                    </>
                  );
                  return (
                    <li key={note.id} className="py-2.5 first:pt-0">
                      {note.application_id ? (
                        <Link
                          href={`/student/requests/${note.application_id}`}
                          className="block hover:bg-muted/40"
                        >
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                Notifications about your applications will appear here.
              </p>
            )}
            {typeof unreadCount === "number" && unreadCount > 0 && (
              <form action={markNotificationsReadAction} className="mt-4">
                <Button type="submit" variant="secondary" size="sm">
                  Mark all read
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
