import { describe, it, expect } from "vitest";
import { queryDatabase } from "./query-database";
import { writeRegisterEntry } from "./write-register-entry";
import type { Tenant, ToolContext } from "./types";

function makeCtx(role: Tenant["role"]): ToolContext {
  return {
    agentId: "agent-cpd-tracker",
    tenant: { role, arId: "ar_codrington" },
    deps: {
      audit: { append: async () => ({ id: "a1" }) },
      store: {
        query: async (table) => [{ table }],
        createPendingDraft: async () => ({ id: "d1", status: "PENDING" }),
        createPendingArtifact: async () => ({ id: "p1", status: "PENDING" }),
        getDraft: async () => null,
      },
    },
  };
}

describe("query_database — training evidence tables are readable", () => {
  it("accepts training_completion and training_certificate in the table enum", () => {
    for (const table of ["training_completion", "training_certificate"]) {
      expect(queryDatabase.input.safeParse({ table }).success).toBe(true);
    }
  });

  it("dispatches a read for the training tables (RLS scopes the rows)", async () => {
    for (const table of ["training_completion", "training_certificate"]) {
      const out = (await queryDatabase.run({ table }, makeCtx("COMPLIANCE"))) as { rows: unknown[] };
      expect(out.rows).toHaveLength(1);
    }
  });

  it("an AR may read its own training evidence (not an internal network table)", async () => {
    const out = (await queryDatabase.run(
      { table: "training_completion" },
      makeCtx("AR"),
    )) as { rows: unknown[] };
    expect(out.rows).toHaveLength(1);
  });
});

describe("write_register_entry — training tables are NOT write targets", () => {
  it("rejects training_completion / training_certificate as registers", () => {
    for (const register of ["training_completion", "training_certificate"]) {
      const parsed = writeRegisterEntry.input.safeParse({
        register,
        arId: "ar_codrington",
        data: {},
        summary: "x",
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("still accepts a real per-AR register (person_cpd)", () => {
    const parsed = writeRegisterEntry.input.safeParse({
      register: "person_cpd",
      arId: "ar_codrington",
      data: {},
      summary: "x",
    });
    expect(parsed.success).toBe(true);
  });
});
