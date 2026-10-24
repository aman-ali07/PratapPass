"use client";

import { Button } from "@/components/ui/button";

/**
 * Client island on the pass page (ARCHITECTURE: minimal client boundaries —
 * the QR itself is a plain <img> of the server-rendered SVG route; this island
 * exists only for the print/download affordances around it). The QR remains
 * visible when printing — only the action row is hidden via `.no-print`.
 */
export function QrPassCard({
  passId,
  passCode,
}: {
  passId: string;
  passCode: string | null;
}) {
  const qrSrc = `/api/passes/${passId}/qr`;
  const stem = passCode
    ? `mpgi-${passCode.toLowerCase().replace("mpgi-", "")}`
    : "mpgi-pass";

  return (
    <figure className="grid justify-items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- the QR is a
          credential served no-store by an authz'ed route; next/image's
          optimizer would fetch-and-cache it, breaking that contract */}
      <img
        src={qrSrc}
        alt={`Gate pass QR${passCode ? ` ${passCode}` : ""} — scan target for gate security`}
        width={220}
        height={220}
        className="rounded-md border border-border bg-white p-2"
      />
      <figcaption className="max-w-xs text-center text-xs text-muted-foreground">
        Show this QR (or the pass code) at the campus gate. Anyone holding it
        can leave under your name — do not share it.
      </figcaption>
      <div className="no-print flex flex-wrap items-center justify-center gap-2">
        <Button type="button" size="sm" onClick={() => window.print()}>
          Print pass
        </Button>
        <Button
          render={
            <a href={`${qrSrc}?format=png&download=1`} download={`${stem}.png`} />
          }
          variant="outline"
          size="sm"
        >
          Download PNG
        </Button>
        <Button
          render={<a href={`${qrSrc}?download=1`} download={`${stem}.svg`} />}
          variant="outline"
          size="sm"
        >
          Download SVG
        </Button>
      </div>
    </figure>
  );
}
