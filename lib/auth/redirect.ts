/**
 * Safe intra-site redirect targets. `?next=` values produced by middleware
 * are path-only, but anything arriving via query string is untrusted: reject
 * anything that is not a same-origin absolute path (no protocol-relative
 * `//host`, no backslashes, robots.txt-style sane length cap).
 */
export function sanitizeRedirectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  return value.length <= 512 ? value : null;
}
