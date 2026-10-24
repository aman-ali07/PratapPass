import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatInstant } from "@/lib/format";
import {
  AUDIT_PAGE_SIZE,
  type AuditFilter,
  auditFilterSchema,
} from "@/lib/validation/admin";

export const metadata: Metadata = { title: "Audit log — PratapPass" };

/** Institutional copy is IST; a date filter means that calendar day in IST. */
const IST_OFFSET = "+05:30";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

function dayStart(date: string): string {
  return new Date(`${date}T00:00:00${IST_OFFSET}`).toISOString();
}

function dayEnd(date: string): string {
  return new Date(`${date}T23:59:59.999${IST_OFFSET}`).toISOString();
}

function pageHref(page: number, filters: AuditFilter): string {
  const params = new URLSearchParams();
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/audit?${query}` : "/admin/audit";
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireAdmin("/admin/audit");
  const raw = await searchParams;

  const parsed = auditFilterSchema.safeParse({
    actor: typeof raw.actor === "string" ? raw.actor : "",
    action: typeof raw.action === "string" ? raw.action : "",
    from: typeof raw.from === "string" ? raw.from : "",
    to: typeof raw.to === "string" ? raw.to : "",
    page: typeof raw.page === "string" ? raw.page : "",
  });
  const filters = parsed.success
    ? parsed.data
    : { actor: "", action: "", from: "", to: "", page: 1 };

  const fromIso = filters.from ? dayStart(filters.from) : null;
  const toIso = filters.to ? dayEnd(filters.to) : null;
  const invalidRange = fromIso !== null && toIso !== null && fromIso > toIso;

  const [entriesResult, actorsResult] = await Promise.all([
    supabase.rpc("fn_admin_list_audit", {
      // Omitted (undefined) args fall back to the SQL defaults, i.e. no filter.
      p_actor_id:
        filters.actor && filters.actor !== "system" ? filters.actor : undefined,
      p_system_actor: filters.actor === "system",
      p_action: filters.action || undefined,
      p_from: invalidRange ? undefined : (fromIso ?? undefined),
      p_to: invalidRange ? undefined : (toIso ?? undefined),
      p_limit: AUDIT_PAGE_SIZE,
      p_offset: (filters.page - 1) * AUDIT_PAGE_SIZE,
    }),
    supabase.rpc("fn_admin_audit_actors"),
  ]);

  if (entriesResult.error) {
    console.error("admin audit fetch failed:", entriesResult.error.message, entriesResult.error.code);
  }
  if (actorsResult.error) {
    console.error("admin audit actors failed:", actorsResult.error.message, actorsResult.error.code);
  }

  const entries = entriesResult.data ?? [];
  const actors = actorsResult.data ?? [];
  const total = entries[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const filtered = Boolean(filters.actor || filters.action || filters.from || filters.to);

  return (
    <>
      <header>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Admin console
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every recorded mutation and document access, newest first. Entries are append-only —
          nobody, including administrators, can edit or delete them.
        </p>
      </header>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            The action filter matches a literal prefix (for example{" "}
            <code className="text-xs">application.</code> or{" "}
            <code className="text-xs">admin.user</code>). Dates are IST calendar days and
            inclusive.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-1.5">
              <Label htmlFor="audit-actor">Actor</Label>
              <select
                id="audit-actor"
                name="actor"
                defaultValue={filters.actor}
                className={SELECT_CLASS}
              >
                <option value="">All actors</option>
                <option value="system">System (no actor)</option>
                {actors
                  .filter((actor) => actor.actor_id !== null)
                  .map((actor) => (
                    <option key={actor.actor_id} value={actor.actor_id ?? ""}>
                      {actor.actor_name} ({actor.entry_count})
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="audit-action">Action prefix</Label>
              <Input
                id="audit-action"
                name="action"
                defaultValue={filters.action}
                placeholder="e.g. application."
                maxLength={80}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="audit-from">From (IST)</Label>
              <Input id="audit-from" name="from" type="date" defaultValue={filters.from} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="audit-to">To (IST)</Label>
              <Input id="audit-to" name="to" type="date" defaultValue={filters.to} />
            </div>

            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit" variant="secondary" size="sm">
                Apply filters
              </Button>
              {filtered && (
                <Button render={<Link href="/admin/audit" />} variant="ghost" size="sm">
                  Clear
                </Button>
              )}
            </div>
          </form>

          {invalidRange && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              The start date is after the end date — the date filter was ignored.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Entries</CardTitle>
          <CardDescription>
            {entriesResult.error
              ? "The log could not be loaded."
              : total === 0
                ? "No entries match these filters."
                : `Showing ${(filters.page - 1) * AUDIT_PAGE_SIZE + 1}–${(filters.page - 1) * AUDIT_PAGE_SIZE + entries.length} of ${total} matching entries.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entriesResult.error ? (
            <p role="alert" className="text-sm text-destructive">
              The audit log could not be loaded — refresh the page or contact the system
              administrator.
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {filters.page > 1 ? (
                <>
                  There are no entries on this page.{" "}
                  <Link
                    href={pageHref(1, filters)}
                    className="font-medium underline underline-offset-4"
                  >
                    Back to the first page
                  </Link>
                  .
                </>
              ) : (
                "Nothing has been recorded for this filter yet."
              )}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="align-top whitespace-nowrap text-muted-foreground">
                      {formatInstant(entry.created_at)}
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="font-medium">{entry.actor_name}</span>
                      {entry.actor_role && (
                        <span className="block text-xs text-muted-foreground">
                          {entry.actor_role}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <code className="text-xs">{entry.action}</code>
                    </TableCell>
                    <TableCell className="align-top">
                      <code className="text-xs">{entry.entity_type}</code>
                      <span className="block text-xs text-muted-foreground">
                        {entry.entity_id.slice(0, 8)}…
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          Metadata
                        </summary>
                        <pre className="mt-1 max-h-40 max-w-xs overflow-auto rounded-md bg-muted/40 p-2 text-xs">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </details>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!entriesResult.error && total > 0 && (
            <nav
              aria-label="Audit pagination"
              className="mt-4 flex flex-wrap items-center justify-between gap-2"
            >
              <p className="text-sm text-muted-foreground">
                {`Page ${filters.page} of ${totalPages}`}
              </p>
              <div className="flex gap-2">
                {filters.page > 1 && (
                  <Button
                    render={<Link href={pageHref(filters.page - 1, filters)} />}
                    variant="secondary"
                    size="sm"
                  >
                    Newer
                  </Button>
                )}
                {filters.page < totalPages && (
                  <Button
                    render={<Link href={pageHref(filters.page + 1, filters)} />}
                    variant="secondary"
                    size="sm"
                  >
                    Older
                  </Button>
                )}
              </div>
            </nav>
          )}
        </CardContent>
      </Card>
    </>
  );
}
