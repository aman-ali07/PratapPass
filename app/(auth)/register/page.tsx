import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "@/components/auth/register-form";
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
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
            <span
              className="bg-brand-gold-gradient inline-block h-2 w-6 rounded-sm"
              aria-hidden="true"
            />
            PratapPass
          </Link>
        </div>
      </header>

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

      <footer className="bg-primary py-3 text-center text-xs text-white/70">
        PratapPass © 2026 — Maharana Pratap Group of Institutions
      </footer>
    </div>
  );
}
