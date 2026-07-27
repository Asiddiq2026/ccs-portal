// Production wiring for the AR roster. Reads through withTenant() (RLS scopes
// the firm) and reuses the shared register + audit adapters so a proposed
// status change travels the same single writeable path as every other draft.
import { withTenant } from "../db";
import { prismaAudit, prismaStore } from "../tools/prisma-adapters";
import type { ArDeps, ArRecord, ArStatus, ArStore } from "./service";
import type { RiskBandName } from "../engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): ArRecord {
  return {
    id: row.id,
    arId: row.arId,
    frn: row.frn,
    legalName: row.legalName,
    status: row.status as ArStatus,
    onboardedAt: row.onboardedAt.toISOString(),
    riskBand: (row.riskBand ?? null) as RiskBandName | null,
  };
}

export const arPrismaStore: ArStore = {
  async listArs(filter, tenant) {
    return withTenant(tenant, async (tx) => {
      const rows = await tx.appointedRep.findMany({
        where: filter.arId ? { arId: filter.arId } : {},
        orderBy: { legalName: "asc" },
      });
      return rows.map(toRecord);
    });
  },

  async getAr(arId, tenant) {
    return withTenant(tenant, async (tx) => {
      const row = await tx.appointedRep.findFirst({ where: { arId } });
      return row ? toRecord(row) : null;
    });
  },

  async openCounts(tenant) {
    return withTenant(tenant, async (tx) => {
      // groupBy keeps this to three queries regardless of roster size.
      const [promotions, breaches, signoffs] = await Promise.all([
        tx.financialPromotion.groupBy({
          by: ["arId"],
          where: { status: "PENDING" },
          _count: { _all: true },
        }),
        tx.dataBreach.groupBy({
          by: ["arId"],
          where: { status: "PENDING" },
          _count: { _all: true },
        }),
        tx.signOffItem.groupBy({
          by: ["arId"],
          where: { status: "PENDING" },
          _count: { _all: true },
        }),
      ]);

      const out: Record<string, { promotions: number; breaches: number; signoffs: number }> = {};
      const bump = (arId: string, key: "promotions" | "breaches" | "signoffs", n: number) => {
        out[arId] ??= { promotions: 0, breaches: 0, signoffs: 0 };
        out[arId][key] = n;
      };
      for (const r of promotions) bump(r.arId, "promotions", r._count._all);
      for (const r of breaches) bump(r.arId, "breaches", r._count._all);
      for (const r of signoffs) bump(r.arId, "signoffs", r._count._all);
      return out;
    });
  },
};

/** The production AR-roster dependency bundle. */
export const arPrismaDeps: ArDeps = {
  store: arPrismaStore,
  register: prismaStore,
  audit: prismaAudit,
};
