// Production wiring for the risk channel. Reads through withTenant() (RLS
// scopes the firm) and reuses the shared register + audit adapters, so a
// proposed assessment travels the same single writeable path as everything else.
import { withTenant } from "../db";
import { prismaAudit, prismaStore } from "../tools/prisma-adapters";
import { RISK_FACTORS, type RiskDeps, type RiskRow, type RiskStore } from "./service";
import type { RiskBandName } from "../engine";

/**
 * `factors` is a Json column. The canonical shape is an array in RISK_FACTORS
 * order, but older rows may hold a keyed object — coerce rather than crash the
 * page, so a legacy row stays visible and can be re-assessed.
 */
function toFactors(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map((n) => Number(n) || 0);
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return RISK_FACTORS.map((f) => Number(obj[f.key]) || 0);
  }
  return [];
}

export const riskPrismaStore: RiskStore = {
  async listArs(filter, tenant) {
    return withTenant(tenant, async (tx) => {
      const rows = await tx.appointedRep.findMany({
        where: filter.arId ? { arId: filter.arId } : {},
        select: { arId: true, legalName: true },
        orderBy: { legalName: "asc" },
      });
      return rows;
    });
  },

  async latestScores(filter, tenant) {
    return withTenant(tenant, async (tx) => {
      const rows = await tx.riskScore.findMany({
        where: filter.arId ? { arId: filter.arId } : {},
        orderBy: { computedAt: "desc" },
      });
      // Keep only the newest row per AR (small data; dedupe in code rather than
      // reaching for a window function).
      const seen = new Set<string>();
      const latest: RiskRow[] = [];
      for (const r of rows) {
        if (seen.has(r.arId)) continue;
        seen.add(r.arId);
        latest.push({
          id: r.id,
          arId: r.arId,
          factors: toFactors(r.factors),
          total: r.total,
          band: r.band as RiskBandName,
          cadence: r.cadence,
          computedAt: r.computedAt.toISOString(),
        });
      }
      return latest;
    });
  },
};

/** The production risk dependency bundle. */
export const riskPrismaDeps: RiskDeps = {
  store: riskPrismaStore,
  register: prismaStore,
  audit: prismaAudit,
};
