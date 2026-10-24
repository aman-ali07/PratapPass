import { NextResponse } from "next/server";

/** Standard route-handler error envelope (API.md §5). */
export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}
