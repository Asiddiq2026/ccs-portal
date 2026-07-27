import { describe, it, expect } from "vitest";
import {
  riskStanding,
  proposeRiskScore,
  RISK_FACTORS,
  RiskError,
  type RiskDeps,
  type RiskRow,
} from "./service";
import { riskReviewMonths } from "../engine";
import type { Tenant } from "../tools/types";

const NOW = "2026-07-01T00:00:00.000Z";

const ARS = [
  { arId: "ar_six", legalName: "SIX Financial Information UK Ltd" },
  { arId: "ar_drakestar", legalName: "Drake Star UK LLP" },
];

function makeDeps(scores: RiskRow[] = [], ars = ARS) {
  const drafts: Array<{ register: string; arId: string; payload: Record<string, unknown>; summary: string }> = [];
  const audits: Array<{ action: string; entity: string }> = [];
  const deps: RiskDeps = {
    store: {
      async listArs(filter) {
        return ars.filter((a) => !filter.arId || a.arId === filter.arId);
      },
      async latestScores(filter) {
        return scores.filter((s) => !filter.arId || s.arId === filter.arId);
      },
    },
    register: {
      async createPendingDraft(input) {
        drafts.push({
          register: input.register,
          arId: input.arId,
          payload: input.payload,
          summary: input.summary,
        });
        return { id: `d${drafts.length}`, status: "PENDING" as const };
      },
    },
    audit: {
      async append(e) {
        audits.push({ action: e.action, entity: e.entity });
        return { id: `a${audits.length}` };
      },
    },
  };
  return { deps, drafts, audits };
}

const OPERATOR: Tenant = { role: "COMPLIANCE", arId: "" };
const SMF: Tenant = { role: "SMF", arId: "" };
const AR: Tenant = { role: "AR", arId: "ar_six" };

function score(over: Partial<RiskRow> = {}): RiskRow {
  return {
    id: "r1",
    arId: "ar_six",
    factors: [1, 2, 1, 1, 1],
    total: 6,
    band: "GREEN",
    cadence: "Bi-annual monitoring",
    computedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("riskReviewMonths", () => {
  it("is bi-annual for GREEN and quarterly otherwise", () => {
    expect(riskReviewMonths("GREEN")).toBe(6);
    expect(riskReviewMonths("AMBER")).toBe(3);
    expect(riskReviewMonths("RED")).toBe(3);
  });
});

describe("riskStanding", () => {
  it("shows an unscored firm rather than omitting it", async () => {
    const { deps } = makeDeps([score()]);
    const list = await riskStanding(deps, OPERATOR, {}, NOW);
    const drake = list.find((s) => s.arId === "ar_drakestar")!;
    expect(drake.neverScored).toBe(true);
    expect(drake.current).toBeNull();
    expect(drake.reviewDue).toBe(true);
  });

  it("computes the review clock from the band's cadence", async () => {
    // GREEN scored 2026-06-01 -> +6 months -> due 2026-12-01, 5 months away.
    const { deps } = makeDeps([score()], [ARS[0]]);
    const [s] = await riskStanding(deps, OPERATOR, {}, NOW);
    expect(s.monthsToReview).toBe(5);
    expect(s.reviewDue).toBe(false);
  });

  it("flags an overdue review (RED re-assessed quarterly)", async () => {
    const { deps } = makeDeps(
      [score({ band: "RED", total: 13, computedAt: "2026-01-01T00:00:00.000Z" })],
      [ARS[0]],
    );
    const [s] = await riskStanding(deps, OPERATOR, {}, NOW);
    expect(s.reviewDue).toBe(true);
    expect(s.monthsToReview).toBe(0);
  });

  it("sorts unscored first, then due, then by severity", async () => {
    const { deps } = makeDeps([score()]);
    const list = await riskStanding(deps, OPERATOR, {}, NOW);
    expect(list[0].arId).toBe("ar_drakestar"); // never scored
  });

  it("is operator-only — an AR cannot see the risk register", async () => {
    const { deps } = makeDeps([score()]);
    await expect(riskStanding(deps, AR, {}, NOW)).rejects.toMatchObject({ status: 403 });
  });
});

describe("proposeRiskScore — the band is derived, never supplied", () => {
  it("computes total/band/cadence from the factors and drafts them", async () => {
    const { deps, drafts, audits } = makeDeps();
    const res = await proposeRiskScore(deps, OPERATOR, { arId: "ar_six", factors: [3, 3, 3, 2, 2] }, NOW);

    expect(res.total).toBe(13);
    expect(res.band).toBe("RED");
    expect(res.cadence).toContain("Quarterly");
    expect(res.status).toBe("PENDING");

    expect(drafts).toHaveLength(1);
    expect(drafts[0].register).toBe("risk_score");
    expect(drafts[0].payload).toMatchObject({ arId: "ar_six", total: 13, band: "RED" });
    expect(drafts[0].payload.factors).toEqual([3, 3, 3, 2, 2]);
    expect(drafts[0].summary).toContain("RED (13/15)");
    expect(audits[0]).toMatchObject({ action: "RISK ASSESSMENT PROPOSED", entity: "risk_score" });
  });

  it("bands at the coded boundaries", async () => {
    const { deps } = makeDeps();
    const green = await proposeRiskScore(deps, OPERATOR, { arId: "ar_six", factors: [1, 1, 2, 2, 1] }, NOW);
    expect(green.total).toBe(7);
    expect(green.band).toBe("GREEN");

    const amber = await proposeRiskScore(deps, OPERATOR, { arId: "ar_six", factors: [2, 2, 2, 1, 1] }, NOW);
    expect(amber.total).toBe(8);
    expect(amber.band).toBe("AMBER");

    const red = await proposeRiskScore(deps, OPERATOR, { arId: "ar_six", factors: [3, 3, 3, 2, 1] }, NOW);
    expect(red.total).toBe(12);
    expect(red.band).toBe("RED");
  });

  it("rejects a malformed assessment before drafting anything", async () => {
    const { deps, drafts } = makeDeps();
    // Wrong number of factors.
    await expect(
      proposeRiskScore(deps, OPERATOR, { arId: "ar_six", factors: [1, 2, 3] }, NOW),
    ).rejects.toMatchObject({ status: 400 });
    // Out of the 1-3 range.
    await expect(
      proposeRiskScore(deps, OPERATOR, { arId: "ar_six", factors: [1, 2, 3, 4, 1] }, NOW),
    ).rejects.toMatchObject({ status: 400 });
    // Missing firm.
    await expect(
      proposeRiskScore(deps, OPERATOR, { arId: "", factors: [1, 1, 1, 1, 1] }, NOW),
    ).rejects.toBeInstanceOf(RiskError);
    expect(drafts).toHaveLength(0);
  });

  it("is operator-only; an SMF may also propose", async () => {
    const { deps, drafts } = makeDeps();
    await expect(
      proposeRiskScore(deps, AR, { arId: "ar_six", factors: [1, 1, 1, 1, 1] }, NOW),
    ).rejects.toMatchObject({ status: 403 });
    await proposeRiskScore(deps, SMF, { arId: "ar_six", factors: [1, 1, 1, 1, 1] }, NOW);
    expect(drafts).toHaveLength(1);
  });

  it("keeps five coded factors in a stable order", () => {
    expect(RISK_FACTORS).toHaveLength(5);
    expect(RISK_FACTORS.map((f) => f.key)).toEqual([
      "conduct", "aml", "complaints", "cpd", "promotions",
    ]);
  });
});
