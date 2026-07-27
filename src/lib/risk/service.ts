// AR risk-scoring channel (SUP 12 proportionate oversight). The principal firm
// assesses each AR across five coded factors scored 1-3; the engine turns those
// into a total, a band and a monitoring cadence. The band is NEVER typed in and
// never judged by a model (Invariant 7) — it is derived from the factor scores.
//
// Scoring is a principal-firm judgement, so it is operator-only: an AR cannot
// score itself. A new assessment is PROPOSED as a PENDING sign-off draft
// targeting risk_score; only an audited SMF sign-off makes it the FINAL
// position (Invariants 1 & 3).
import { buildRiskScore } from "../models/risk";
import { monthsUntil, riskReviewMonths, type RiskBandName } from "../engine";
import type { AuditWriter, RegisterStore, Tenant } from "../tools/types";

/**
 * The five oversight factors, in the canonical order they are stored. Kept in
 * code so an assessment is comparable across firms and over time rather than
 * free-typed. 1 = low concern, 3 = high concern.
 */
export const RISK_FACTORS = [
  { key: "conduct", label: "Conduct & customer outcomes" },
  { key: "aml", label: "Financial crime / AML exposure" },
  { key: "complaints", label: "Complaints volume & severity" },
  { key: "cpd", label: "Competence & CPD standing" },
  { key: "promotions", label: "Financial promotions quality" },
] as const;

export type RiskFactorKey = (typeof RISK_FACTORS)[number]["key"];

export class RiskError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RiskError";
  }
}

/** A FINAL risk_score register row. */
export interface RiskRow {
  id: string;
  arId: string;
  factors: number[];
  total: number;
  band: RiskBandName;
  cadence: string;
  computedAt: string;
}

/** The current position for one AR, with its review clock. */
export interface RiskStanding {
  arId: string;
  legalName: string;
  /** null when the firm has never been scored. */
  current: RiskRow | null;
  /** Months until the next assessment is due (0 when due or overdue). */
  monthsToReview: number;
  reviewDue: boolean;
  neverScored: boolean;
}

export interface RiskStore {
  /** Every AR on the roster, so an unscored firm is visible rather than absent. */
  listArs(filter: { arId?: string }, tenant: Tenant): Promise<Array<{ arId: string; legalName: string }>>;
  /** Latest risk_score per AR. */
  latestScores(filter: { arId?: string }, tenant: Tenant): Promise<RiskRow[]>;
}

export interface RiskDeps {
  store: RiskStore;
  register: Pick<RegisterStore, "createPendingDraft">;
  audit: AuditWriter;
}

function actorOf(tenant: Tenant): string {
  return `${tenant.role}:${tenant.arId || "network"}`;
}

function assertOperator(tenant: Tenant): void {
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    throw new RiskError(403, "forbidden: risk scoring is a principal-firm assessment");
  }
}

/** Add the review clock to a scored (or unscored) firm. */
function toStanding(
  ar: { arId: string; legalName: string },
  current: RiskRow | null,
  nowIso: string,
): RiskStanding {
  if (!current) {
    return { arId: ar.arId, legalName: ar.legalName, current: null, monthsToReview: 0, reviewDue: true, neverScored: true };
  }
  const due = new Date(current.computedAt);
  due.setUTCMonth(due.getUTCMonth() + riskReviewMonths(current.band));
  const monthsToReview = monthsUntil(due.toISOString(), nowIso);
  return {
    arId: ar.arId,
    legalName: ar.legalName,
    current,
    monthsToReview,
    reviewDue: due.getTime() <= new Date(nowIso).getTime(),
    neverScored: false,
  };
}

/** Risk standing across the roster (operators) — most overdue first. */
export async function riskStanding(
  deps: RiskDeps,
  tenant: Tenant,
  filter: { arId?: string } = {},
  nowIso: string = new Date().toISOString(),
): Promise<RiskStanding[]> {
  assertOperator(tenant);
  const [ars, scores] = await Promise.all([
    deps.store.listArs(filter, tenant),
    deps.store.latestScores(filter, tenant),
  ]);
  const byAr = new Map(scores.map((s) => [s.arId, s]));

  return ars
    .map((ar) => toStanding(ar, byAr.get(ar.arId) ?? null, nowIso))
    .sort((a, b) => {
      // Unscored first, then due, then by risk band severity.
      if (a.neverScored !== b.neverScored) return a.neverScored ? -1 : 1;
      if (a.reviewDue !== b.reviewDue) return a.reviewDue ? -1 : 1;
      return (b.current?.total ?? 0) - (a.current?.total ?? 0);
    });
}

export interface ProposeRiskInput {
  arId: string;
  /** Five scores, 1-3, in RISK_FACTORS order. */
  factors: number[];
}

/**
 * Propose a new risk assessment. The engine derives total/band/cadence from the
 * factor scores; the caller cannot supply them. Creates a PENDING sign-off
 * draft — it does not write the register.
 */
export async function proposeRiskScore(
  deps: RiskDeps,
  tenant: Tenant,
  input: ProposeRiskInput,
  nowIso: string = new Date().toISOString(),
): Promise<{ id: string; status: "PENDING"; total: number; band: RiskBandName; cadence: string }> {
  assertOperator(tenant);
  if (!input.arId?.trim()) throw new RiskError(400, "arId is required");

  // buildRiskScore enforces exactly five integer factors in 1-3 and computes the
  // band; a malformed assessment is rejected before anything is drafted.
  let model;
  try {
    model = buildRiskScore({
      arId: input.arId.trim(),
      factors: input.factors,
      computedAt: new Date(nowIso),
    });
  } catch (err) {
    throw new RiskError(400, (err as Error).message);
  }
  const { data } = model;

  const draft = await deps.register.createPendingDraft(
    {
      register: "risk_score",
      arId: data.arId,
      payload: {
        arId: data.arId,
        factors: data.factors,
        total: data.total,
        band: data.band,
        cadence: data.cadence,
        computedAt: data.computedAt.toISOString(),
      },
      summary:
        `Risk assessment for ${data.arId} — ${data.band} (${data.total}/15) · ${data.cadence}. ` +
        RISK_FACTORS.map((f, i) => `${f.key} ${data.factors[i]}`).join(", "),
      createdBy: actorOf(tenant),
    },
    tenant,
  );

  await deps.audit.append(
    { actor: actorOf(tenant), action: "RISK ASSESSMENT PROPOSED", entity: "risk_score", entityId: draft.id },
    tenant,
  );

  return { id: draft.id, status: "PENDING", total: data.total, band: data.band, cadence: data.cadence };
}
