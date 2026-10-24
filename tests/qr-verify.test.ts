import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { assertSeedData, psql, psqlFile } from "./helpers";

const FIXTURE = fileURLToPath(new URL("./fixtures/qr-verify.sql", import.meta.url));

describe("QR and gate verification", () => {
  beforeAll(() => {
    assertSeedData();
  });

  it("scopes token derivation and classifies passes without leaking medical data", () => {
    const before = psql("select count(*) from public.gate_pass_applications");
    expect(() => psqlFile(FIXTURE)).not.toThrow();
    expect(psql("select count(*) from public.gate_pass_applications")).toBe(before);
  });
});
