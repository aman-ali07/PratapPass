import Link from "next/link";
import type { ReactNode } from "react";

/** Shared brand header. Portal pages pass their right-side action via `right`. */
export function AppHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="bg-primary text-primary-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
        <Link
          href="/"
          className="inline-flex min-h-11 min-w-0 items-center gap-2 text-sm font-semibold"
        >
          <span
            className="bg-brand-gold-gradient inline-block h-2 w-6 shrink-0 rounded-sm"
            aria-hidden="true"
          />
          <span className="truncate">PratapPass</span>
        </Link>
        {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
      </div>
    </header>
  );
}
