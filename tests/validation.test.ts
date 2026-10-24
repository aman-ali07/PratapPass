import { describe, expect, it } from "vitest";

import { sniffDocumentMime } from "@/lib/documents/magic";
import {
  DOCUMENT_MAX_BYTES,
  applicationSchema,
  documentFileSchema,
  infoAnswerSchema,
  reasonSchema,
} from "@/lib/validation/application";
import {
  gateEventSchema,
  gateProbeSchema,
  gateRecordRequestSchema,
  gateVerifyRequestSchema,
} from "@/lib/validation/gate";

function fileOf(size: number, type = "application/pdf"): File {
  return new File([new Uint8Array(size)], "document.pdf", { type });
}

describe("sniffDocumentMime", () => {
  it("recognises PDF, JPEG and PNG magic bytes", () => {
    expect(sniffDocumentMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffDocumentMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(
      sniffDocumentMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("image/png");
  });

  it("rejects non-document and truncated headers", () => {
    expect(sniffDocumentMime(new TextEncoder().encode("hello world"))).toBeNull();
    expect(sniffDocumentMime(new TextEncoder().encode("%PD"))).toBeNull();
    expect(sniffDocumentMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(
      sniffDocumentMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a])),
    ).toBeNull();
    // GIF is an image, but not one the product accepts.
    expect(sniffDocumentMime(new TextEncoder().encode("GIF89a"))).toBeNull();
  });
});

describe("documentFileSchema", () => {
  it("accepts a PDF at the 4 MiB cap", () => {
    expect(documentFileSchema.safeParse(fileOf(DOCUMENT_MAX_BYTES)).success).toBe(true);
  });

  it("rejects a file one byte over the cap", () => {
    const result = documentFileSchema.safeParse(fileOf(DOCUMENT_MAX_BYTES + 1));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Document must be at most 4 MB.");
  });

  it("rejects a declared MIME type outside the allowlist", () => {
    const result = documentFileSchema.safeParse(fileOf(10, "text/plain"));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Only PDF, JPG or PNG documents are accepted.",
    );
  });

  it("rejects a missing file", () => {
    const result = documentFileSchema.safeParse(undefined);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Attach a document file.");
  });
});

describe("applicationSchema", () => {
  const valid = {
    reason: "personal" as const,
    departureAt: "2026-10-25T04:30:00.000Z",
    expectedReturnAt: "2026-10-25T10:30:00.000Z",
    explanation: "  Family function at home.  ",
  };

  it("accepts a valid future window and trims the explanation", () => {
    const result = applicationSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.explanation).toBe("Family function at home.");
  });

  it("rejects a return that is not after departure", () => {
    const result = applicationSchema.safeParse({
      ...valid,
      expectedReturnAt: valid.departureAt,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["expectedReturnAt"]);
    expect(result.error?.issues[0]?.message).toBe("Expected return must be after departure.");
  });

  it("rejects a too-short explanation", () => {
    const result = applicationSchema.safeParse({ ...valid, explanation: "  x  " });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Describe the reason briefly (3+ characters).",
    );
  });

  it("rejects an unknown request reason", () => {
    const result = applicationSchema.safeParse({ ...valid, reason: "other" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-ISO timestamp", () => {
    const result = applicationSchema.safeParse({ ...valid, departureAt: "tomorrow" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a valid date and time.");
  });

  it("accepts only the three student-facing reasons", () => {
    expect(reasonSchema.options).toEqual(["medical", "personal", "emergency"]);
  });
});

describe("infoAnswerSchema", () => {
  it("accepts a version-0 uuid (the repo's fixture ids) and trims the answer", () => {
    const result = infoAnswerSchema.safeParse({
      applicationId: IDS_APP,
      text: "  Here is the certificate.  ",
    });
    expect(result.success).toBe(true);
    expect(result.data?.text).toBe("Here is the certificate.");
  });

  it("rejects a malformed application id and an empty answer", () => {
    expect(
      infoAnswerSchema.safeParse({ applicationId: "not-a-uuid", text: "answer" }).success,
    ).toBe(false);
    expect(
      infoAnswerSchema.safeParse({ applicationId: IDS_APP, text: "   " }).success,
    ).toBe(false);
  });

  it("rejects an answer over 2000 characters", () => {
    const result = infoAnswerSchema.safeParse({
      applicationId: IDS_APP,
      text: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

const IDS_APP = "00000000-0000-0000-0000-000000002001";

describe("gate validation", () => {
  it("trims a probe and rejects empty/overlong values", () => {
    expect(gateProbeSchema.parse("  MPGI-100F0A  ")).toBe("MPGI-100F0A");
    expect(gateProbeSchema.safeParse("   ").success).toBe(false);
    expect(gateProbeSchema.safeParse("x".repeat(129)).success).toBe(false);
  });

  it("accepts exactly the three gate events", () => {
    expect(gateEventSchema.options).toEqual(["exit", "return", "rejection"]);
    expect(gateEventSchema.safeParse("entry").success).toBe(false);
  });

  it("rejects unknown fields at the JSON boundary", () => {
    expect(
      gateVerifyRequestSchema.safeParse({ token: "MPGI-100F0A", extra: true }).success,
    ).toBe(false);
    expect(
      gateRecordRequestSchema.safeParse({
        token: "MPGI-100F0A",
        event: "exit",
        reason: "medical",
      }).success,
    ).toBe(false);
    expect(
      gateRecordRequestSchema.safeParse({ token: "MPGI-100F0A", event: "exit" }).success,
    ).toBe(true);
  });
});
