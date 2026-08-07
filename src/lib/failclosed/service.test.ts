import { describe, it, expect } from "vitest";
import {
  recordFailClosedReview,
  FailClosedError,
  type FailClosedDeps,
  type FailClosedReview,
} from "./service";
import type { Tenant } from "../tools/types";

const SMF: Tenant = { role: "SMF", arId: "" };
const AR: Tenant = { role: "AR", arId: "ar_six" };
const NOW = new Date("2026-08-05T10:00:00.000Z");

function deps(
  overrides: Partial<{
    verdict: "DRAFT READY" | "OPERATOR REVIEW" | null;
    existing: FailClosedReview | null;
  }> = {},
) {
  const inserted: FailClosedReview[] = [];
  const audited: string[] = [];
  const d: FailClosedDeps = {
    store: {
      async getRunVerdict() {
        return overrides.verdict === undefined ? "OPERATOR REVIEW" : overrides.verdict;
      },
      async getReview() {
        return overrides.existing ?? null;
      },
      async insertReview(input) {
        inserted.push(input);
      },
    },
    audit: {
      async append(e) {
        audited.push(e.action);
        return { id: "evt_test" };
      },
    },
  };
  return { d, inserted, audited };
}

describe("recordFailClosedReview", () => {
  it("records a review with the reviewer and rationale, and audits it", async () => {
    const { d, inserted, audited } = deps();
    const review = await recordFailClosedReview(d, SMF, { runId: "run_1", rationale: "  looked into it, reran  " }, NOW);
    expect(review).toEqual({
      runId: "run_1",
      reviewer: "SMF:network",
      rationale: "looked into it, reran", // trimmed
      ts: NOW,
    });
    expect(inserted).toHaveLength(1);
    expect(audited).toEqual(["FAIL-CLOSED REVIEWED"]);
  });

  it("rejects a non-operator (403)", async () => {
    const { d } = deps();
    await expect(recordFailClosedReview(d, AR, { runId: "r", rationale: "x" })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("requires a rationale (400)", async () => {
    const { d, inserted } = deps();
    await expect(
      recordFailClosedReview(d, SMF, { runId: "r", rationale: "   " }),
    ).rejects.toBeInstanceOf(FailClosedError);
    expect(inserted).toHaveLength(0);
  });

  it("rejects a run that did not fail closed (409)", async () => {
    const { d } = deps({ verdict: "DRAFT READY" });
    await expect(recordFailClosedReview(d, SMF, { runId: "r", rationale: "x" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("rejects an unknown run (404)", async () => {
    const { d } = deps({ verdict: null });
    await expect(recordFailClosedReview(d, SMF, { runId: "r", rationale: "x" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("rejects a second review of the same run (409)", async () => {
    const { d, inserted } = deps({
      existing: { runId: "r", reviewer: "SMF:network", rationale: "first", ts: NOW },
    });
    await expect(recordFailClosedReview(d, SMF, { runId: "r", rationale: "second" })).rejects.toMatchObject({
      status: 409,
    });
    expect(inserted).toHaveLength(0);
  });
});
