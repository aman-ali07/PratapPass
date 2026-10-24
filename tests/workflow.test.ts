import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { assertSeedData, psql, psqlFile } from "./helpers";

const FIXTURE = fileURLToPath(new URL("./fixtures/workflow.sql", import.meta.url));

describe("workflow transitions", () => {
  beforeAll(() => {
    assertSeedData();
  });

  it("submits, pauses for info, resumes, approves, issues a pass, and completes at the gate", () => {
    const before = psql("select count(*) from public.gate_pass_applications");
    expect(() => psqlFile(FIXTURE)).not.toThrow();
    // The fixture writes only inside its transaction; a leaked write would change this.
    expect(psql("select count(*) from public.gate_pass_applications")).toBe(before);
  });
});
