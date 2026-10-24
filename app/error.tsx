"use client";

import Link from "next/link";
import { useEffect } from "react";

import { AppFooter } from "@/components/layout/app-footer";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("unhandled page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader
        right={
          <Button render={<Link href="/" />} variant="secondary" size="sm">
            Home
          </Button>
        }
      />
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The page could not be loaded. Try again; if it keeps happening, contact the
          administration office.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button render={<Link href="/" />} variant="secondary">
            Go home
          </Button>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
