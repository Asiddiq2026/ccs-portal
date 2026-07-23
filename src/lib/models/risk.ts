// Phase 6 wiring — Risk Scores derive total / band / cadence from the engine's
// 5-factor banding, never a hand-typed band (Invariant 7). Single place that
// turns factor scores into a persistable risk_score row.
import { riskBand, type RiskBandName } from "../engine";

export interface RiskModel {
  /** Prisma-ready row for `risk_score`. */
  data: {
    arId: string;
    factors: number[];
    total: number;
    band: RiskBandName;
    cadence: string;
    computedAt: Date;
  };
}

/**
 * Build a risk_score row from exactly five factors, each scored 1-3. Validates
 * the shape here so no malformed score ever reaches the band logic or the DB.
 */
export function buildRiskScore(input: {
  arId: string;
  factors: number[];
  computedAt?: Date;
}): RiskModel {
  const { factors } = input;
  if (factors.length !== 5) {
    throw new Error(`risk score requires exactly 5 factors, got ${factors.length}`);
  }
  for (const f of factors) {
    if (!Number.isInteger(f) || f < 1 || f > 3) {
      throw new Error(`risk factor out of range (expected integer 1-3): ${f}`);
    }
  }
  const { total, band, cadence } = riskBand(factors);
  return {
    data: {
      arId: input.arId,
      factors,
      total,
      band,
      cadence,
      computedAt: input.computedAt ?? new Date(),
    },
  };
}
