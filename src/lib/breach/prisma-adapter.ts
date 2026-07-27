// Production wiring for the breach channel: BreachStore backed by Prisma, each
// call scoped through withTenant() so RLS binds the caller's firm. The service
// never imports Prisma — only this adapter does.
import { withTenant } from "../db";
import { prismaAudit } from "../tools/prisma-adapters";
import type { BreachDeps, BreachRecord, BreachStore, Severity } from "./service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): BreachRecord {
  return {
    id: row.id,
    arId: row.arId,
    ref: row.ref,
    detectedAt: row.detectedAt.toISOString(),
    art33Clock: row.art33Clock.toISOString(),
    status: row.status,
    severity: row.severity as Severity,
  };
}

export const breachPrismaStore: BreachStore = {
  async createBreach(input, tenant) {
    return withTenant(tenant, async (tx) => {
      // Human-facing ref. Same caveat as FP: count()+1 can race, but the unique
      // constraint on `ref` makes a collision fail loudly rather than duplicate.
      const n = await tx.dataBreach.count();
      const ref = `BR-${String(1000 + n + 1).padStart(4, "0")}`;
      const row = await tx.dataBreach.create({
        data: {
          arId: input.arId,
          ref,
          detectedAt: input.detectedAt,
          art33Clock: input.art33Clock,
          severity: input.severity,
          status: "PENDING",
        },
      });
      return toRecord(row);
    });
  },

  async getBreach(id, tenant) {
    return withTenant(tenant, async (tx) => {
      const row = await tx.dataBreach.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    });
  },

  async listBreaches(filter, tenant) {
    return withTenant(tenant, async (tx) => {
      const rows = await tx.dataBreach.findMany({
        where: filter.arId ? { arId: filter.arId } : {},
        orderBy: { detectedAt: "desc" },
      });
      return rows.map(toRecord);
    });
  },

  async setStatus(id, status, tenant) {
    return withTenant(tenant, async (tx) => {
      const row = await tx.dataBreach.update({ where: { id }, data: { status } });
      return toRecord(row);
    });
  },
};

/** The production breach dependency bundle. */
export const breachPrismaDeps: BreachDeps = {
  store: breachPrismaStore,
  audit: prismaAudit,
};
