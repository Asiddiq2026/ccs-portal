import { describe, it, expect } from "vitest";
import { cpdStanding, proposeCpdUpdate, CpdError, type CpdDeps, type CpdRegisterRow } from "./service";
import { monthsUntil } from "../engine";
import type { Tenant } from "../tools/types";

const NOW = "2026-07-01T00:00:00.000Z";

// In-memory stubs — no DB. Completions drive the evidence side; person_cpd rows
// are the signed-off side.
function makeDeps(
  rows: CpdRegisterRow[],
  completions: Array<{ arId: string; person: string; moduleId: string; passed: boolean }> = [],
) {
  const drafts: Array<{ register: string; arId: string; payload: Record<string, unknown>; summary: string }> = [];
  const audits: Array<{ action: string; entity: string }> = [];
  const deps: CpdDeps = {
    store: {
      async listPersonCpd(filter) {
        return rows.filter((r) => !filter.arId || r.arId === filter.arId);
      },
    },
    training: {
      async listCompletions(filter) {
        return completions
          .filter((c) => c.arId === filter.arId && (!filter.person || c.person === filter.person))
          .map((c) => ({ person: c.person, moduleId: c.moduleId, passed: c.passed }));
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

const PERSON: CpdRegisterRow = {
  id: "p1",
  arId: "ar_codrington",
  person: "Rob Tull",
  cpdHours: 0,
  required: 35,
  strikes: 0,
  certExpiry: "2026-12-31T00:00:00.000Z",
};

const OPERATOR: Tenant = { role: "COMPLIANCE", arId: "" };
const SMF: Tenant = { role: "SMF", arId: "" };
const AR: Tenant = { role: "AR", arId: "ar_codrington" };

describe("monthsUntil", () => {
  it("floors to whole months and never goes negative", () => {
    expect(monthsUntil("2026-12-31T00:00:00.000Z", NOW)).toBe(5);
    expect(monthsUntil("2026-07-15T00:00:00.000Z", NOW)).toBe(0);
    expect(monthsUntil("2025-01-01T00:00:00.000Z", NOW)).toBe(0);
  });
});

describe("cpdStanding — register vs evidence", () => {
  it("credits passed modules and flags drift against the signed-off row", async () => {
    const { deps } = makeDeps(
      [PERSON],
      [
        { arId: "ar_codrington", person: "Rob Tull", moduleId: "m1", passed: true }, // 4h
        { arId: "ar_codrington", person: "Rob Tull", moduleId: "m3", passed: true }, // 5h
        { arId: "ar_codrington", person: "Rob Tull", moduleId: "m4", passed: false }, // no credit
      ],
    );
    const [s] = await cpdStanding(deps, OPERATOR, {}, NOW);
    expect(s.creditedHours).toBe(9);
    expect(s.recordedHours).toBe(0);
    expect(s.modulesPassed).toBe(2);
    expect(s.monthsLeft).toBe(5);
    expect(s.drift).toBe(true);
  });

  it("reports no drift when the register already matches", async () => {
    const { deps } = makeDeps(
      [{ ...PERSON, cpdHours: 4, strikes: 0 }],
      [{ arId: "ar_codrington", person: "Rob Tull", moduleId: "m1", passed: true }],
    );
    const [s] = await cpdStanding(deps, OPERATOR, {}, NOW);
    expect(s.drift).toBe(false);
  });

  it("derives the strike level from the coded ladder as the year runs out", async () => {
    // 0 credited hours, cert expires this month -> monthsLeft 0 -> 3 strikes.
    const { deps } = makeDeps([{ ...PERSON, certExpiry: "2026-07-01T00:00:00.000Z" }]);
    const [s] = await cpdStanding(deps, OPERATOR, {}, NOW);
    expect(s.monthsLeft).toBe(0);
    expect(s.derivedStrikes).toBe(3);
  });

  it("sorts the most at-risk first", async () => {
    const { deps } = makeDeps([
      { ...PERSON, id: "p2", person: "Safe", certExpiry: "2027-06-30T00:00:00.000Z" },
      { ...PERSON, id: "p3", person: "AtRisk", certExpiry: "2026-07-01T00:00:00.000Z" },
    ]);
    const list = await cpdStanding(deps, OPERATOR, {}, NOW);
    expect(list[0].person).toBe("AtRisk");
  });

  it("forbids an AR reading another firm's CPD", async () => {
    const { deps } = makeDeps([PERSON]);
    await expect(cpdStanding(deps, AR, { arId: "ar_six" }, NOW)).rejects.toMatchObject({ status: 403 });
  });
});

describe("proposeCpdUpdate — drafts, never writes", () => {
  it("creates a PENDING person_cpd draft carrying the engine-derived figures", async () => {
    const { deps, drafts, audits } = makeDeps(
      [PERSON],
      [
        { arId: "ar_codrington", person: "Rob Tull", moduleId: "m1", passed: true },
        { arId: "ar_codrington", person: "Rob Tull", moduleId: "m3", passed: true },
      ],
    );
    const res = await proposeCpdUpdate(deps, OPERATOR, { arId: "ar_codrington", person: "Rob Tull" }, NOW);

    expect(res.status).toBe("PENDING");
    expect(res.creditedHours).toBe(9);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].register).toBe("person_cpd");
    expect(drafts[0].payload).toMatchObject({
      arId: "ar_codrington",
      person: "Rob Tull",
      cpdHours: 9,
      required: 35,
    });
    expect(drafts[0].summary).toContain("2 passed modules");
    expect(audits[0]).toMatchObject({ action: "CPD UPDATE PROPOSED", entity: "person_cpd" });
  });

  it("refuses when there is nothing to propose (409)", async () => {
    const { deps, drafts } = makeDeps(
      [{ ...PERSON, cpdHours: 4 }],
      [{ arId: "ar_codrington", person: "Rob Tull", moduleId: "m1", passed: true }],
    );
    await expect(
      proposeCpdUpdate(deps, OPERATOR, { arId: "ar_codrington", person: "Rob Tull" }, NOW),
    ).rejects.toMatchObject({ status: 409 });
    expect(drafts).toHaveLength(0);
  });

  it("404s an unknown person and 403s a non-operator", async () => {
    const { deps } = makeDeps([PERSON]);
    await expect(
      proposeCpdUpdate(deps, OPERATOR, { arId: "ar_codrington", person: "Nobody" }, NOW),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      proposeCpdUpdate(deps, AR, { arId: "ar_codrington", person: "Rob Tull" }, NOW),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("an SMF may also propose (they still sign it off separately)", async () => {
    const { deps, drafts } = makeDeps(
      [PERSON],
      [{ arId: "ar_codrington", person: "Rob Tull", moduleId: "m1", passed: true }],
    );
    await proposeCpdUpdate(deps, SMF, { arId: "ar_codrington", person: "Rob Tull" }, NOW);
    expect(drafts).toHaveLength(1);
  });
});
