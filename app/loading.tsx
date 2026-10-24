import { AppHeader } from "@/components/layout/app-header";

export default function Loading() {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main
        id="main-content"
        aria-busy="true"
        aria-label="Loading page"
        className="mx-auto w-full max-w-4xl flex-1 px-4 py-10"
      >
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-muted" />
        <div className="mt-6 h-64 animate-pulse rounded-xl border bg-muted/40" />
      </main>
    </div>
  );
}
