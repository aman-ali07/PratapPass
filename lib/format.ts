/**
 * Instant formatting for institutional copy. PratapPass serves MPGI Kanpur, so
 * timestamps render explicitly in IST on the SERVER — client-side formatting
 * with a browser timezone would both skew the copy and risk hydration
 * mismatches; a fixed zone keeps every surface deterministic.
 */
const IST_TIME_ZONE = "Asia/Kolkata";

const instantFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: IST_TIME_ZONE,
});

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: IST_TIME_ZONE,
});

export function formatInstant(iso: string): string {
  return instantFormatter.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/**
 * Human byte sizes for document listings (4 MiB cap — D-016; sub-KB sizes show
 * one granularity up so "832 bytes" copy stays meaningful).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
