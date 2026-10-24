import type { ReactNode } from "react";

import { signOutAction } from "@/app/student/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { AppFooter } from "@/components/layout/app-footer";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";

/**
 * Admin chrome only. Authorization lives in each page (via `requireAdmin`):
 * Next layouts do not re-run on client-side navigation, so a guard here would
 * be stale on the first soft navigation.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
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
      <AdminNav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
      <AppFooter />
    </div>
  );
}
