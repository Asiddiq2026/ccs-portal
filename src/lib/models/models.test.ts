import { describe, it, expect } from "vitest";
import { buildCf30Return } from "./cf30";
import { buildRiskScore } from "./risk";

describe("buildCf30Return — engine-derived due date (Invariant 7)", () => {
  it("derives the quarter label + due date for a date inside Q1 2026", () => {
    const m = buildCf30Return({ arId: "ar_six", referenceDate: "2026-02-15" });
    expect(m.quarterEnd).toBe("2026-03-31");
    expect(m.data.quarter).toBe("2026-Q1");
    expect(m.dueDate).toBe("2026-04-16"); // quarter-end + 10 business days
    expect(m.data.dueDate.toISOString().slice(0, 10)).toBe("2026-04-16");
    expect(m.data.status).toBe("PENDING");
  });

  it("produces the T-5BD…T+20BD ladder centred on the due date", () => {
    const m = buildCf30Return({ arId: "ar_six", referenceDate: "2026-03-31" });
    expect(m.ladder.map((s) => s.step)).toEqual(["T-5BD", "T", "T+5BD", "T+10BD", "T+20BD"]);
    expect(m.ladder[1].date).toBe(m.dueDate);
  });
});

describe("buildRiskScore — engine-derived band (Invariant 7)", () => {
  it("bands 5-7 GREEN / 8-11 AMBER / 12-15 RED with cadence", () => {
    expect(buildRiskScore({ arId: "ar_six", factors: [1, 1, 1, 1, 1] }).data).toMatchObject({
      total: 5,
      band: "GREEN",
      cadence: "Bi-annual monitoring",
    });
    expect(buildRiskScore({ arId: "ar_six", factors: [2, 2, 2, 2, 2] }).data).toMatchObject({
      total: 10,
      band: "AMBER",
      cadence: "Quarterly monitoring",
    });
    expect(buildRiskScore({ arId: "ar_six", factors: [3, 3, 3, 3, 3] }).data).toMatchObject({
      total: 15,
      band: "RED",
      cadence: "Quarterly + ad-hoc monitoring",
    });
  });

  it("rejects a malformed factor set", () => {
    expect(() => buildRiskScore({ arId: "ar_six", factors: [1, 2, 3] })).toThrow(/exactly 5/);
    expect(() => buildRiskScore({ arId: "ar_six", factors: [1, 2, 3, 4, 1] })).toThrow(/out of range/);
    expect(() => buildRiskScore({ arId: "ar_six", factors: [1, 2, 3, 3, 1.5] })).toThrow(/out of range/);
  });
});
