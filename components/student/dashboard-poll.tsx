"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Near-real-time status for the student dashboard: server components re-read
 * RLS-filtered data on `router.refresh()`. A 15 s poll keeps two identities
 * (student vs approver) consistent without opening a Realtime socket in the
 * MVP; the interval is a UI concern and safe to raise later.
 */
export function DashboardPoll({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
