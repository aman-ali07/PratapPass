import Link from "next/link";
import type { ReactNode } from "react";

/** Shared brand header. Portal pages pass their right-side action via `right`. */
export function AppHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="bg-primary text-primary-foreground">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
          <span
            className="bg-brand-gold-gradient inline-block h-2 w-6 rounded-sm"
            aria-hidden="true"
          />
          PratapPass
        </Link>
        {right}
      </div>
    </header>
  );
}
