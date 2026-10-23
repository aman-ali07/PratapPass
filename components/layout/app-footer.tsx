/** Shared footer. Single color source: `primary-foreground` on `primary`, so
 * dark-mode inversion keeps contrast (never hardcode white here). */
export function AppFooter() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-1 px-4 py-4 text-xs text-primary-foreground/70 sm:flex-row">
        <span>PratapPass © 2026 — Maharana Pratap Group of Institutions</span>
        <span>Digital Gate Pass &amp; Medical Approval System</span>
      </div>
    </footer>
  );
}
