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
import { ApplicationForm } from "@/components/student/application-form";

export const metadata: Metadata = { title: "New application — PratapPass" };

export default async function ApplyPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Fstudent%2Fapply");
  }

  // Student-only surface: a staff member opening this route directly should
  // land on their own dashboard instead of an operable application form.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "student") {
    redirect("/student");
  }

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader
        right={
          <Button render={<Link href="/student" />} variant="secondary" size="sm">
            Back to dashboard
          </Button>
        }
      />

      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold">New gate-pass application</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submitted applications are routed to your department&apos;s approval chain;
          you will be notified at every step.
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Application details</CardTitle>
            <CardDescription>
              Emergency requests bypass the faculty step and reach the HOD directly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApplicationForm />
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
