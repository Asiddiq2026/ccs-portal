// Prisma wiring for the fail-closed disposition store, each call scoped through
// withTenant() so RLS binds (operator-only read/write). The service never
// imports Prisma — only this adapter does.
import { withTenant } from "../db";
import { prismaAudit } from "../tools/prisma-adapters";
import type { Tenant } from "../tools/types";
import type { FailClosedDeps, FailClosedReview, FailClosedStore } from "./service";

function verdictOf(output: unknown): "DRAFT READY" | "OPERATOR REVIEW" {
  const v = (output as { verdict?: unknown } | null)?.verdict;
  return v === "DRAFT READY" ? "DRAFT READY" : "OPERATOR REVIEW";
}

export const failClosedPrismaStore: FailClosedStore = {
  async getRunVerdict(runId, tenant) {
    return withTenant(tenant, async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const run = await (tx as any).agentRun.findUnique({
        where: { id: runId },
        select: { output: true },
      });
      return run ? verdictOf(run.output) : null;
    });
  },

  async getReview(runId, tenant) {
    return withTenant(tenant, async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await (tx as any).failClosedReview.findUnique({ where: { runId } });
      return row
        ? { runId: row.runId, reviewer: row.reviewer, rationale: row.rationale, ts: row.ts }
        : null;
    });
  },

  async insertReview(input: FailClosedReview, tenant) {
    await withTenant(tenant, async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (tx as any).failClosedReview.create({
        data: {
          runId: input.runId,
          reviewer: input.reviewer,
          rationale: input.rationale,
          ts: input.ts,
        },
      });
    });
  },
};

export const failClosedPrismaDeps: FailClosedDeps = {
  store: failClosedPrismaStore,
  audit: prismaAudit,
};

/** Run ids (from a candidate set) that already have a disposition. */
export async function reviewedRunIds(
  runIds: readonly string[],
  tenant: Tenant,
): Promise<Set<string>> {
  if (runIds.length === 0) return new Set();
  return withTenant(tenant, async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (tx as any).failClosedReview.findMany({
      where: { runId: { in: [...runIds] } },
      select: { runId: true },
    });
    return new Set(rows.map((r: { runId: string }) => r.runId));
  });
}
