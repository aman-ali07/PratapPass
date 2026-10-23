import type { Metadata } from "next";

import { RegisterForm } from "@/components/auth/register-form";
import { AppFooter } from "@/components/layout/app-footer";
import { AppHeader } from "@/components/layout/app-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Student registration — PratapPass" };

export default function RegisterPage() {
  return (
    <div className="flex min-h-svh flex-col bg-secondary/40">
      <AppHeader />

      <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4 py-10">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-xl">Student registration</CardTitle>
            <CardDescription>
              Register with your roll number. Faculty, HOD, security and admin accounts are
              provisioned by the administration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterForm />
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
