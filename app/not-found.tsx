import Link from "next/link";

import { AppFooter } from "@/components/layout/app-footer";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";

export default function NotFound() {
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
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          404
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This page may have moved, or your account may not have access to it.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button render={<Link href="/student" />}>Go to dashboard</Button>
          <Button render={<Link href="/" />} variant="secondary">
            Home
          </Button>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
