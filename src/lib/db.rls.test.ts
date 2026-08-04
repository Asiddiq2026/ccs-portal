import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, withTenant } from "./db";
import { prismaAudit } from "./tools/prisma-adapters";
import { prismaMeter } from "./metering/prisma-adapter";
import { cf30DueDate, quarterEnd } from "./engine";

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

  it("an AR sees only its own training_certificate manifests", async () => {
    const rows = await withTenant({ role: "AR", arId: "ar_six" }, (tx) =>
      tx.trainingCertificate.findMany(),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.arId === "ar_six")).toBe(true);
  });

  it("training_certificate is append-only — UPDATE is denied to ccs_app", async () => {
    await expect(
      withTenant({ role: "COMPLIANCE", arId: "" }, (tx) =>
        tx.trainingCertificate.updateMany({ data: { size: 0 } }),
      ),
    ).rejects.toThrow();
  });

  it("seeded CF30 due dates agree with the deterministic engine", async () => {
    // A live agent run halted to OPERATOR REVIEW because the seeded due date
    // (2026-04-14) contradicted compute_dates (2026-04-16). Data that disagrees
    // with the engine is unusable by design — the agent is right to refuse it —
    // so the seed must derive dates rather than hand-type them (Invariant 7).
    const rows = await withTenant({ role: "COMPLIANCE", arId: "" }, (tx) =>
      tx.cf30Return.findMany({ select: { quarter: true, dueDate: true } }),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const expected = cf30DueDate(quarterEnd(`${r.quarter.slice(0, 4)}-03-31`));
      if (r.quarter.endsWith("Q1")) {
        expect(r.dueDate.toISOString().slice(0, 10)).toBe(expected);
      }
    }
  });

  it("model_usage: any role appends, only operators read, nothing updates", async () => {
    // The metering ledger mirrors agent_run's posture: append-only + operator
    // read. An AR-triggered path may record spend but must not see the ledger.
    await prismaMeter.record(
      { source: "agent_run", tokens: 123, arId: "ar_six" },
      { role: "AR", arId: "ar_six" },
    );
    const asAr = await withTenant({ role: "AR", arId: "ar_six" }, (tx) => tx.modelUsage.count());
    expect(asAr).toBe(0); // operator-only read
    const asOp = await withTenant({ role: "COMPLIANCE", arId: "" }, (tx) => tx.modelUsage.count());
    expect(asOp).toBeGreaterThan(0);
    const mtd = await prismaMeter.monthToDate(new Date(), { role: "COMPLIANCE", arId: "" });
    expect(mtd).toBeGreaterThanOrEqual(123);
    await expect(
      withTenant({ role: "COMPLIANCE", arId: "" }, (tx) =>
        tx.modelUsage.updateMany({ data: { tokens: 0 } }),
      ),
    ).rejects.toThrow();
  });

  it("a non-operator (AR) appends audit AND the row is chained", async () => {
    // Two regressions in one. (1) audit_event's SELECT policy is operator-only,
    // so INSERT ... RETURNING (Prisma .create) fails for an AR — the writer must
    // avoid RETURNING. (2) The same policy hid the chain tail from AR writers,
    // so their rows silently carried hashPrev NULL — unverifiable holes in the
    // chain, found live via the training-app sync. The writer now reads the
    // tail under a scoped, restored elevation; this asserts the result.
    const before = await withTenant({ role: "COMPLIANCE", arId: "" }, (tx) => tx.auditEvent.count());
    const res = await prismaAudit.append(
      { actor: "AR:ar_six", action: "TEST APPEND", entity: "training_completion" },
      { role: "AR", arId: "ar_six" },
    );
    expect(res.id).toBeTruthy();

    const row = await withTenant({ role: "COMPLIANCE", arId: "" }, (tx) =>
      tx.auditEvent.findUnique({ where: { id: res.id } }),
    );
    expect(row).not.toBeNull();
    // A prior row always exists here (the seed writes one), so an unchained
    // append would mean the AR writer could not see the tail.
    expect(row!.hashPrev).toMatch(/^[0-9a-f]{64}$/);

    const after = await withTenant({ role: "COMPLIANCE", arId: "" }, (tx) => tx.auditEvent.count());
    expect(after).toBe(before + 1);
  });
});
