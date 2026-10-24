import { NextResponse } from "next/server";
import QRCode from "qrcode";

import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** D-015: the QR IS the credential — never cache it in any shared store. */
const CACHE_CONTROL = "no-store";

const QR_OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 2,
  color: { dark: "#0F4C97", light: "#FFFFFF" },
} as const;

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function fileBase(passCode: string | null): string {
  return passCode ? `mpgi-${passCode.toLowerCase().replace("mpgi-", "")}` : "mpgi-pass";
}

/**
 * QR encoding `{SITE}/verify?token=…` for one issued gate pass (API.md §3).
 * Scope is re-checked EXPLICITLY at this boundary (student owner / admin only;
 * gate security consumes the raw token itself, never pass ids) and unknown and
 * out-of-scope ids return the same 404 — no existence oracle. The raw token is
 * re-derived by `fn_pass_qr_token` (migration 0010) under the caller's session:
 * the DB alone holds the secret, digests it against the stored hash, and fails
 * loudly on rotation — the route never touches `private.app_secrets` directly.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return jsonError(404, "not_found", "Pass not found");
  }
  const wantsPng = new URL(request.url).searchParams.get("format") === "png";
  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError(401, "unauthenticated", "Sign in required");
  }

  // Boundary facts with the service-role client, mirroring the documents route.
  const admin = createSupabaseAdminClient();
  const { error: passError, data: pass } = await admin
    .from("gate_passes")
    .select("id, pass_code, application:gate_pass_applications(student_id)")
    .eq("id", id)
    .maybeSingle();
  if (passError) {
    console.error("pass lookup failed:", passError.message, passError.code);
    return jsonError(500, "internal_error", "QR could not be issued");
  }
  if (!pass?.application) {
    return jsonError(404, "not_found", "Pass not found");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const scopeOk =
    profile?.role === "admin" ||
    (profile?.role === "student" && pass.application.student_id === user.id);
  if (!scopeOk) {
    // Same response as an unknown id — permission answers leak existence.
    return jsonError(404, "not_found", "Pass not found");
  }

  // Layer 2 under the REAL session: only the DB can bring the secret in.
  const { data: raw, error: tokenError } = await supabase.rpc("fn_pass_qr_token", {
    p_pass_id: id,
  });
  if (tokenError || typeof raw !== "string") {
    if (tokenError?.message.includes("secret is not configured")) {
      console.error("QR secret missing from private.app_secrets");
      return jsonError(500, "internal_error", "QR could not be issued");
    }
    // Anything else at this layer is a state race or drift — no oracle.
    console.error("pass token re-derivation failed:", tokenError?.message);
    return jsonError(404, "not_found", "Pass not found");
  }

  const verifyUrl = new URL("/verify", env.NEXT_PUBLIC_SITE_URL);
  verifyUrl.searchParams.set("token", raw);

  const filename = `${fileBase(pass.pass_code)}.${wantsPng ? "png" : "svg"}`;
  const disposition = wantsDownload
    ? `attachment; filename="${filename}"`
    : "inline";

  if (wantsPng) {
    const buffer = await QRCode.toBuffer(verifyUrl.toString(), {
      ...QR_OPTIONS,
      width: 512,
    });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": disposition,
        "Cache-Control": CACHE_CONTROL,
      },
    });
  }
  const svg = await QRCode.toString(verifyUrl.toString(), {
    ...QR_OPTIONS,
    type: "svg",
  });
  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": disposition,
      "Cache-Control": CACHE_CONTROL,
    },
  });
}
