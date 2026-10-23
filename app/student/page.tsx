import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
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

// Narrow local type until T-03 ships `supabase gen types` (DATABASE.md §7).
type UserRole = "student" | "faculty" | "hod" | "security" | "admin";

type ProfileRow = {
  full_name: string;
  roll_number: string | null;
  role: UserRole;
  department: { name: string } | null;
};

export default async function StudentDashboard() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Fstudent");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, roll_number, role, department:departments(id, name)")
    .eq("id", user.id)
    .returns<ProfileRow[]>();

  if (error) {
    // Server-side only: PostgREST messages can carry policy/table internals.
    console.error("student profile fetch failed:", error.message, error.code);
  }
  const profile = data?.[0];

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
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">My dashboard</h1>
          <Badge variant="outline">T-02 in progress</Badge>
        </div>

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
              Arrives with milestone T-06: online application with medical document uploads,
              review chain, and live status tracking.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
