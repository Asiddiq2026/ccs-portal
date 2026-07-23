import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, withTenant } from "./db";

// Integration proof that RLS actually isolates tenants — not just that the app
// *intends* to. It talks to a real Postgres as the NOBYPASSRLS `ccs_app` role,
// so it only runs when explicitly opted in:
//
//   RUN_DB_TESTS=true npm test
//
// Prereq: `npm run db:setup` (migrate + apply RLS + seed) against a disposable
// database. The seed creates ARs ar_six / ar_drakestar / ar_codrington.
const RUN = process.env.RUN_DB_TESTS === "true";

describe.runIf(RUN)("RLS tenant isolation (Invariant 5)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("an AR sees only its own firm's appointed_rep row", async () => {
    const rows = await withTenant({ role: "AR", arId: "ar_six" }, (tx) =>
      tx.appointedRep.findMany(),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.arId === "ar_six")).toBe(true);
  });

  it("an AR cannot read another firm's rows even by explicit filter", async () => {
    const rows = await withTenant({ role: "AR", arId: "ar_six" }, (tx) =>
      tx.cf30Return.findMany({ where: { arId: "ar_drakestar" } }),
    );
    // The policy filters first; a cross-tenant WHERE simply matches nothing.
    expect(rows).toHaveLength(0);
  });

  it("COMPLIANCE sees rows across every firm (network scope)", async () => {
    const arIds = await withTenant({ role: "COMPLIANCE", arId: "" }, async (tx) => {
      const rows = await tx.appointedRep.findMany();
      return new Set(rows.map((r) => r.arId));
    });
    expect(arIds.size).toBeGreaterThanOrEqual(2);
  });

  it("a context-less connection matches no rows (fail closed)", async () => {
    // No set_config → app.ar_id/app.role are empty → policy USING is false.
    const rows = await prisma.appointedRep.findMany();
    expect(rows).toHaveLength(0);
  });

  it("an AR sees only its own training_completion evidence", async () => {
    const rows = await withTenant({ role: "AR", arId: "ar_six" }, (tx) =>
      tx.trainingCompletion.findMany(),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.arId === "ar_six")).toBe(true);
  });

  it("training_completion is append-only — UPDATE is denied to ccs_app", async () => {
    // REVOKE UPDATE means Postgres refuses the write regardless of RLS policy.
    await expect(
      withTenant({ role: "COMPLIANCE", arId: "" }, (tx) =>
        tx.trainingCompletion.updateMany({ data: { pct: 0 } }),
      ),
    ).rejects.toThrow();
  });
});
