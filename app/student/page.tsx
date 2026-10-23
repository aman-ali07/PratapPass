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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "./actions";

export const metadata: Metadata = { title: "My dashboard — PratapPass" };

export default async function StudentDashboard({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const submitted = (await searchParams).submitted;

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

        {submitted && (
          <p
            role="status"
            className="mt-4 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            Application received — your approval chain is queued. You will be
            notified when a reviewer acts on it.
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
              Submit a new application with any required medical document; the live
              status timeline arrives with T-07.
            </CardDescription>
          </CardHeader>
          {profile?.role === "student" && (
            <CardContent>
              <Button render={<Link href="/student/apply" />} size="sm">
                New application
              </Button>
            </CardContent>
          )}
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
