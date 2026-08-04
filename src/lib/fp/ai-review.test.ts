import { describe, it, expect } from "vitest";
import {
  reviewPromotion,
  parseVerdict,
  buildReviewPrompt,
  type AiReviewDeps,
  type ModelClient,
} from "./ai-review";
import type { FpRecord } from "./service";
import type { Tenant } from "../tools/types";

const SMF: Tenant = { role: "SMF", arId: "" };

const FP: FpRecord = {
  id: "fp1",
  arId: "ar_six",
  ref: "FP-0234",
  type: "TEASER",
  title: "European MedTech — Q3 sector teaser",
  audience: "Professional",
  cobs: [
    { label: "Fair, clear and not misleading (COBS 4.2)", checked: true },
    { label: "Risk warnings prominent and balanced", checked: false },
  ],
  status: "PENDING",
  submittedBy: "u-ar",
  reviewedBy: null,
  reviewerNotes: null,
};

function makeDeps(complete: ModelClient["complete"]) {
  const audited: { action: string; entityId?: string }[] = [];
  const deps: AiReviewDeps = {
    model: { complete },
    audit: {
      append: async (e) => {
        audited.push({ action: e.action, entityId: e.entityId });
        return { id: `a${audited.length}` };
      },
    },
  };
  return { deps, audited };
}

describe("parseVerdict — severity precedence", () => {
  it("REJECT beats everything", () => {
    expect(parseVerdict("...overall verdict: REJECT. Also could APPROVE parts.")).toBe("REJECT");
  });
  it("APPROVE WITH CONDITIONS beats plain APPROVE", () => {
    expect(parseVerdict("Verdict: APPROVE WITH CONDITIONS")).toBe("APPROVE WITH CONDITIONS");
  });
  it("APPROVE when clean", () => {
    expect(parseVerdict("All good. Verdict: APPROVE")).toBe("APPROVE");
  });
  it("defaults to REFER when unrecognised", () => {
    expect(parseVerdict("The submission is unclear.")).toBe("REFER FOR FURTHER REVIEW");
  });
});

describe("buildReviewPrompt", () => {
  it("keeps the verbatim framing and includes the promotion data + checklist", () => {
    const p = buildReviewPrompt(FP);
    expect(p).toContain("senior compliance analyst at CCS");
    expect(p).toContain("Razlin Limited (FRN 730805)");
    expect(p).toContain("COBS 4.2.1R (fair, clear and not misleading)");
    expect(p).toContain("Promotion Reference: FP-0234");
    expect(p).toContain("[x] Fair, clear and not misleading (COBS 4.2)");
    expect(p).toContain("[ ] Risk warnings prominent and balanced");
  });
});

describe("reviewPromotion", () => {
  it("returns a structured advisory verdict and audits AI REVIEW", async () => {
    const { deps, audited } = makeDeps(async () => ({
      text: "Findings... Overall verdict: APPROVE WITH CONDITIONS.",
      tokens: 500,
    }));
    const out = await reviewPromotion(deps, SMF, FP);
    expect(out.ref).toBe("FP-0234");
    expect(out.verdict).toBe("APPROVE WITH CONDITIONS");
    expect(out.advisory).toMatch(/advisory only/i);
    expect(audited.some((a) => a.action === "AI REVIEW" && a.entityId === "fp1")).toBe(true);
  });

  it("logs the AI REVIEW request even when the model call fails, then propagates", async () => {
    const { deps, audited } = makeDeps(async () => {
      throw new Error("upstream 529");
    });
    await expect(reviewPromotion(deps, SMF, FP)).rejects.toThrow(/529/);
    // Request was audited up front (fail-closed leaves a trail).
    expect(audited.some((a) => a.action === "AI REVIEW")).toBe(true);
  });

  it("records token usage in the ledger when a meter is wired", async () => {
    const { deps } = makeDeps(async () => ({ text: "Verdict: APPROVE", tokens: 777 }));
    const recorded: { source: string; tokens: number; arId?: string | null }[] = [];
    deps.meter = {
      record: async (u) => {
        recorded.push(u);
      },
      monthToDate: async () => 0,
    };
    deps.budget = 10_000;
    await reviewPromotion(deps, SMF, FP);
    expect(recorded).toEqual([{ source: "fp_ai_review", tokens: 777, arId: FP.arId }]);
  });

  it("refuses BEFORE the model call when the monthly budget is exhausted (429)", async () => {
    let modelCalled = false;
    const { deps, audited } = makeDeps(async () => {
      modelCalled = true;
      return { text: "Verdict: APPROVE", tokens: 1 };
    });
    deps.meter = { record: async () => {}, monthToDate: async () => 10_000 };
    deps.budget = 10_000;
    await expect(reviewPromotion(deps, SMF, FP)).rejects.toMatchObject({ status: 429 });
    expect(modelCalled).toBe(false);
    // Nothing was audited either — the request never got that far.
    expect(audited).toHaveLength(0);
  });
});
