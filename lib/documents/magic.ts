/**
 * Byte-prefix sniffing for medical documents (SECURITY.md §3): the browser's
 * declared `File.type` is a claim, never evidence — the first bytes decide the
 * stored content type. Kept free of `server-only` so the dev evidence scripts
 * can import the exact implementation the server action uses.
 */
export type DocumentMime = "application/pdf" | "image/jpeg" | "image/png";

export const DOCUMENT_EXTENSIONS: Record<DocumentMime, "pdf" | "jpg" | "png"> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function sniffDocumentMime(head: Uint8Array): DocumentMime | null {
  // "%PDF" — Chromium/Acrobat writers place the header at offset 0.
  if (
    head.length >= 4 &&
    head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46
  ) {
    return "application/pdf";
  }
  // JPEG SOI + first marker byte.
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG signature (89 50 4E 47 0D 0A 1A 0A).
  if (
    head.length >= 8 &&
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}
