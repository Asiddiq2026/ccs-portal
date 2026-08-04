// Prisma-backed MeterStore. Writes use createMany with a code-generated id (no
// RETURNING — model_usage's SELECT policy is operator-only, same reasoning as
// the audit writer); reads run under the caller's tenant, and every current
// caller (agent-run route, AI-review route) is operator-gated upstream.
import { randomUUID } from "node:crypto";
import { withTenant } from "../db";
import { monthStartUtc, type MeterStore } from "./service";

export const prismaMeter: MeterStore = {
  async record(usage, tenant) {
    await withTenant(tenant, async (tx) => {
      await tx.modelUsage.createMany({
        data: [
          {
            id: `use_${randomUUID()}`,
            source: usage.source,
            tokens: usage.tokens,
            arId: usage.arId ?? null,
          },
        ],
      });
    });
  },

  async monthToDate(now, tenant) {
    return withTenant(tenant, async (tx) => {
      const agg = await tx.modelUsage.aggregate({
        _sum: { tokens: true },
        where: { ts: { gte: monthStartUtc(now) } },
      });
      return agg._sum.tokens ?? 0;
    });
  },
};
