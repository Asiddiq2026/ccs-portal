import { describe, it, expect } from "vitest";
import { computeThresholds } from "./compute";
import type { ToolContext } from "./types";

// compute_thresholds is pure COMPUTE — deps are unused, so an empty ctx is fine.
const CTX = {} as ToolContext;

describe("compute_thresholds — CPD from completions", () => {
  it("credits raw completions via the engine (model never sums)", async () => {
    const out = (await computeThresholds.run(
      {
        cpd: {
          completions: [
            { moduleId: "m1", passed: true }, // 4h
            { moduleId: "m3", passed: true }, // 5h
            { moduleId: "m3", passed: true }, // retake — counts once
            { moduleId: "m4", passed: false }, // no credit
          ],
          monthsLeft: 6,
        },
      },
      CTX,
    )) as { cpdHours: number; cpdStrike: number };
    expect(out.cpdHours).toBe(9);
    expect(out.cpdStrike).toBe(0); // 6 months left, no strike yet
  });

  it("still accepts hours directly (backward compatible)", async () => {
    const out = (await computeThresholds.run(
      { cpd: { hours: 10, monthsLeft: 0 } },
      CTX,
    )) as { cpdHours: number; cpdStrike: number };
    expect(out.cpdHours).toBe(10);
    expect(out.cpdStrike).toBe(3); // 10h < 35h at year end
  });

  it("computes risk banding independently", async () => {
    const out = (await computeThresholds.run(
      { riskFactors: [3, 3, 3, 3, 3] },
      CTX,
    )) as { risk: { total: number; band: string } };
    expect(out.risk.total).toBe(15);
    expect(out.risk.band).toBe("RED");
  });
});
