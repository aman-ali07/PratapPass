import { type NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

import { env } from "@/lib/env";

/** Route groups guarded by a live session (role guards live near routes). */
const protectedPrefixes = ["/student", "/approver", "/admin"];

/** Auth routes bounce an already-authenticated user to their portal root. */
const authRoutes = ["/login", "/register"];

function isProtected(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Supabase SSR "update session" middleware (ARCHITECTURE §2): refreshes the
 * auth cookie pair on every eligible request, then enforces coarse session
 * gating. Role authorization is enforced server-side (SECURITY.md §1) — the
 * middleware gate only distinguishes authenticated vs anonymous.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtected(pathname)) {
    const next = encodeURIComponent(pathname + request.nextUrl.search);
    return NextResponse.redirect(new URL(`/login?next=${next}`, request.url));
  }

  if (user && authRoutes.includes(pathname)) {
    return NextResponse.redirect(new URL("/student", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff2)$).*)",
  ],
};
