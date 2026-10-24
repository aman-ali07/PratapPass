import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import { AppFooter } from "@/components/layout/app-footer";
import { AppHeader } from "@/components/layout/app-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sanitizeRedirectPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Sign in — PratapPass" };

// Next 15: searchParams is a Promise. The value is pre-validated here, but the
// server action re-validates because it is user-controlled.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-svh flex-col bg-secondary/40">
      <AppHeader />

      <main id="main-content" className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4 py-10">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              Use the email address you registered with PratapPass.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm next={sanitizeRedirectPath(next)} />
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
