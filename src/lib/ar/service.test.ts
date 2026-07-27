import { describe, it, expect } from "vitest";
import {
  arRoster,
  proposeArStatusChange,
  AR_TRANSITIONS,
  ArError,
  type ArDeps,
  type ArRecord,
  type ArStatus,
} from "./service";
import type { Tenant } from "../tools/types";

function ar(over: Partial<ArRecord> = {}): ArRecord {
  return {
    id: "a1",
    arId: "ar_six",
    frn: "900001",
    legalName: "SIX Financial Information UK Ltd",
    status: "ACTIVE",
    onboardedAt: "2025-01-15T09:00:00.000Z",
    riskBand: "GREEN",
    ...over,
  };
}

function makeDeps(
  ars: ArRecord[],
  counts: Record<string, { promotions: number; breaches: number; signoffs: number }> = {},
) {
  const drafts: Array<{ register: string; arId: string; payload: Record<string, unknown>; summary: string }> = [];
  const audits: Array<{ action: string; entity: string }> = [];
  const deps: ArDeps = {
    store: {
      async listArs(filter) {
        return ars.filter((a) => !filter.arId || a.arId === filter.arId);
      },
      async getAr(arId) {
        return ars.find((a) => a.arId === arId) ?? null;
      },
      async openCounts() {
        return counts;
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
const AR_USER: Tenant = { role: "AR", arId: "ar_six" };

describe("AR_TRANSITIONS — the coded state machine", () => {
  it("makes TERMINATED terminal", () => {
    expect(AR_TRANSITIONS.TERMINATED).toEqual([]);
  });

  it("allows only the lawful moves from each state", () => {
    expect(AR_TRANSITIONS.ONBOARDING).toEqual(["ACTIVE", "TERMINATED"]);
    expect(AR_TRANSITIONS.ACTIVE).toEqual(["SUSPENDED", "TERMINATED"]);
    expect(AR_TRANSITIONS.SUSPENDED).toEqual(["ACTIVE", "TERMINATED"]);
  });
});

describe("arRoster", () => {
  it("attaches allowed next states and open oversight counts", async () => {
    const { deps } = makeDeps([ar()], { ar_six: { promotions: 2, breaches: 1, signoffs: 3 } });
    const [row] = await arRoster(deps, OPERATOR);
    expect(row.allowedNext).toEqual(["SUSPENDED", "TERMINATED"]);
    expect(row.openPromotions).toBe(2);
    expect(row.openBreaches).toBe(1);
    expect(row.pendingSignoffs).toBe(3);
  });

  it("defaults counts to zero for a firm with no open items", async () => {
    const { deps } = makeDeps([ar()]);
    const [row] = await arRoster(deps, OPERATOR);
    expect(row.openPromotions).toBe(0);
    expect(row.openBreaches).toBe(0);
  });

  it("sorts suspended first, terminated last, then by oversight load", async () => {
    const { deps } = makeDeps(
      [
        ar({ arId: "ar_term", legalName: "Gone Ltd", status: "TERMINATED" }),
        ar({ arId: "ar_busy", legalName: "Busy Ltd", status: "ACTIVE" }),
        ar({ arId: "ar_susp", legalName: "Paused Ltd", status: "SUSPENDED" }),
      ],
      { ar_busy: { promotions: 5, breaches: 0, signoffs: 0 } },
    );
    const list = await arRoster(deps, OPERATOR);
    expect(list.map((r) => r.arId)).toEqual(["ar_susp", "ar_busy", "ar_term"]);
  });

  it("is operator-only", async () => {
    const { deps } = makeDeps([ar()]);
    await expect(arRoster(deps, AR_USER)).rejects.toMatchObject({ status: 403 });
  });
});

describe("proposeArStatusChange — drafts, never writes", () => {
  it("creates a PENDING appointed_rep draft carrying the full row", async () => {
    const { deps, drafts, audits } = makeDeps([ar()]);
    const res = await proposeArStatusChange(deps, OPERATOR, {
      arId: "ar_six",
      status: "SUSPENDED",
      reason: "Unremediated CF30 breaches",
    });

    expect(res).toMatchObject({ status: "PENDING", from: "ACTIVE", to: "SUSPENDED" });
    expect(drafts[0].register).toBe("appointed_rep");
    expect(drafts[0].payload).toMatchObject({
      arId: "ar_six",
      frn: "900001",
      status: "SUSPENDED",
      legalName: "SIX Financial Information UK Ltd",
    });
    expect(drafts[0].summary).toContain("ACTIVE -> SUSPENDED");
    expect(drafts[0].summary).toContain("Unremediated CF30 breaches");
    expect(audits[0]).toMatchObject({ action: "AR STATUS CHANGE PROPOSED", entity: "appointed_rep" });
  });

  it("refuses an unlawful transition (409) and reviving a terminated firm", async () => {
    const { deps, drafts } = makeDeps([ar({ status: "ONBOARDING" })]);
    // ONBOARDING cannot go straight to SUSPENDED.
    await expect(
      proposeArStatusChange(deps, OPERATOR, { arId: "ar_six", status: "SUSPENDED", reason: "x" }),
    ).rejects.toMatchObject({ status: 409 });

    const dead = makeDeps([ar({ arId: "ar_dead", status: "TERMINATED" })]);
    await expect(
      proposeArStatusChange(dead.deps, OPERATOR, { arId: "ar_dead", status: "ACTIVE", reason: "x" }),
    ).rejects.toThrow(/cannot be revived/);
    expect(drafts).toHaveLength(0);
  });

  it("requires a reason and a known firm", async () => {
    const { deps } = makeDeps([ar()]);
    await expect(
      proposeArStatusChange(deps, OPERATOR, { arId: "ar_six", status: "SUSPENDED", reason: "  " }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      proposeArStatusChange(deps, OPERATOR, { arId: "nope", status: "ACTIVE", reason: "x" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("is operator-only; an SMF may also propose", async () => {
    const { deps, drafts } = makeDeps([ar()]);
    await expect(
      proposeArStatusChange(deps, AR_USER, { arId: "ar_six", status: "SUSPENDED", reason: "x" }),
    ).rejects.toMatchObject({ status: 403 });
    await proposeArStatusChange(deps, SMF, { arId: "ar_six", status: "TERMINATED", reason: "Wound down" });
    expect(drafts).toHaveLength(1);
  });

  it("permits every lawful move from each state", async () => {
    for (const [from, targets] of Object.entries(AR_TRANSITIONS) as [ArStatus, ArStatus[]][]) {
      for (const to of targets) {
        const { deps, drafts } = makeDeps([ar({ status: from })]);
        await proposeArStatusChange(deps, OPERATOR, { arId: "ar_six", status: to, reason: "test" });
        expect(drafts).toHaveLength(1);
      }
    }
  });
});
