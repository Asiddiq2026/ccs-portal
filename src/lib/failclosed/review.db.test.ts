import { describe, it, expect, afterAll } from "vitest";
import { prisma, withTenant } from "../db";
import { prismaAgentRunLog } from "../agents/prisma-run-log";
import { failClosedPrismaDeps, reviewedRunIds } from "./prisma-adapter";
import { recordFailClosedReview } from "./service";
import type { Tenant } from "../tools/types";

// Integration proof that fail-closed disposition works against a real database:
// the review is append-only, operator-scoped (an AR can neither see nor write
// it), keyed one-per-run, and it removes the run from the open set.
//
//   RUN_DB_TESTS=true npm test
const RUN = process.env.RUN_DB_TESTS === "true";

const OPERATOR: Tenant = { role: "COMPLIANCE", arId: "" };
const AR: Tenant = { role: "AR", arId: "ar_six" };
const STAMP = Date.now();

async function seedRun(verdict: "OPERATOR REVIEW" | "DRAFT READY", summary: string): Promise<string> {
  const { id } = await prismaAgentRunLog.append(
    {
      agentId: `zz-test-${STAMP}`,
      version: "vT",
      promptHash: "h",
      inputHash: "h",
      tokens: 0,
      output: { verdict, summary },
    },
    OPERATOR,
  );
  return id;
}

describe.runIf(RUN)("fail-closed disposition (real Postgres)", () => {
  afterAll(async () => {
    await withTenant(OPERATOR, async (tx) => {
      // fail_closed_review has no delete grant; leave rows (test ids are unique).
      // agent_run is append-only too — both are timestamped/prefixed test rows.
      void tx;
    });
    await prisma.$disconnect();
  });

  it("records a review and drops the run from the open set", async () => {
    const runId = await seedRun("OPERATOR REVIEW", "halted on ambiguity");

    // Before: the halt is open (no review yet).
    expect((await reviewedRunIds([runId], OPERATOR)).has(runId)).toBe(false);

    await recordFailClosedReview(failClosedPrismaDeps, OPERATOR, {
      runId,
      rationale: "investigated; seed data corrected; re-ran clean",
    });

    // After: the halt is closed.
    expect((await reviewedRunIds([runId], OPERATOR)).has(runId)).toBe(true);

    // The disposition is on the tamper-evident audit trail.
    const audit = await withTenant(OPERATOR, (tx) =>
      tx.auditEvent.findFirst({
        where: { entity: "agent_run", entityId: runId, action: "FAIL-CLOSED REVIEWED" },
      }),
    );
    expect(audit).not.toBeNull();
  });

  it("refuses a second review of the same run (one disposition per run)", async () => {
    const runId = await seedRun("OPERATOR REVIEW", "halted again");
    await recordFailClosedReview(failClosedPrismaDeps, OPERATOR, { runId, rationale: "first" });
    await expect(
      recordFailClosedReview(failClosedPrismaDeps, OPERATOR, { runId, rationale: "second" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses to review a run that did not fail closed", async () => {
    const runId = await seedRun("DRAFT READY", "produced a draft");
    await expect(
      recordFailClosedReview(failClosedPrismaDeps, OPERATOR, { runId, rationale: "n/a" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("an AR can neither read nor write a fail-closed review", async () => {
    const runId = await seedRun("OPERATOR REVIEW", "operator-only");
    await recordFailClosedReview(failClosedPrismaDeps, OPERATOR, { runId, rationale: "done" });

    // Read: RLS is operator-only, so an AR context sees no review rows at all.
    const arView = await withTenant(AR, (tx) => tx.failClosedReview.count());
    expect(arView).toBe(0);

    // Write: the service refuses an AR (403) before touching the store.
    await expect(
      recordFailClosedReview(failClosedPrismaDeps, AR, { runId, rationale: "sneaky" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("the review row cannot be updated (append-only)", async () => {
    const runId = await seedRun("OPERATOR REVIEW", "immutable");
    await recordFailClosedReview(failClosedPrismaDeps, OPERATOR, { runId, rationale: "original" });
    await expect(
      withTenant(OPERATOR, (tx) =>
        tx.failClosedReview.updateMany({ where: { runId }, data: { rationale: "tampered" } }),
      ),
    ).rejects.toThrow();
  });
});
