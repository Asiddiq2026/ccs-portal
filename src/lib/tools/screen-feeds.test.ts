import { describe, it, expect } from "vitest";
import { screenFeeds, FEED_FLAG_THRESHOLD } from "./screen-feeds";
import type { FeedScreener, FeedScreenResult, ToolContext } from "./types";

function makeCtx(feeds?: FeedScreener) {
  const ctx: ToolContext = {
    agentId: "agent-anomaly",
    tenant: { role: "COMPLIANCE", arId: "ar_six" },
    deps: {
      audit: { append: async () => ({ id: "a1" }) },
      store: {
        query: async () => [],
        createPendingDraft: async () => ({ id: "d1", status: "PENDING" as const }),
        createPendingArtifact: async () => ({ id: "p1", status: "PENDING" as const }),
        getDraft: async () => null,
      },
      feeds,
    },
  };
  return ctx;
}

function screener(result: FeedScreenResult | (() => never)): FeedScreener {
  return {
    screen: async () => {
      if (typeof result === "function") return result();
      return result;
    },
  };
}

describe("screen_feeds — coded threshold + fail-closed", () => {
  it("fails closed to OPERATOR_REVIEW when no screener is wired", async () => {
    const out = (await screenFeeds.run({ subjects: ["Acme Ltd"] }, makeCtx(undefined))) as {
      verdict: string;
      flagged: unknown[];
    };
    expect(out.verdict).toBe("OPERATOR_REVIEW");
    expect(out.flagged).toHaveLength(0);
  });

  it("fails closed when the provider errors — never a silent CLEAR", async () => {
    const ctx = makeCtx(
      screener(() => {
        throw new Error("timeout");
      }),
    );
    const out = (await screenFeeds.run({ subjects: ["Acme Ltd"] }, ctx)) as { verdict: string; reason?: string };
    expect(out.verdict).toBe("OPERATOR_REVIEW");
    expect(out.reason).toContain("timeout");
  });

  it("fails closed when the provider returns ok:false", async () => {
    const ctx = makeCtx(screener({ ok: false, provider: "vendorX", hits: [] }));
    const out = (await screenFeeds.run({ subjects: ["Acme Ltd"] }, ctx)) as { verdict: string };
    expect(out.verdict).toBe("OPERATOR_REVIEW");
  });

  it("CLEAR when all hits are below the coded threshold", async () => {
    const ctx = makeCtx(
      screener({
        ok: true,
        provider: "vendorX",
        hits: [{ subject: "Acme Ltd", source: "news", matchScore: FEED_FLAG_THRESHOLD - 1, summary: "weak match" }],
      }),
    );
    const out = (await screenFeeds.run({ subjects: ["Acme Ltd"] }, ctx)) as { verdict: string; flagged: unknown[] };
    expect(out.verdict).toBe("CLEAR");
    expect(out.flagged).toHaveLength(0);
  });

  it("FLAGGED when a hit meets the coded threshold", async () => {
    const ctx = makeCtx(
      screener({
        ok: true,
        provider: "vendorX",
        hits: [
          { subject: "Acme Ltd", source: "sanctions", matchScore: FEED_FLAG_THRESHOLD, summary: "OFAC match" },
          { subject: "Acme Ltd", source: "news", matchScore: 10, summary: "noise" },
        ],
      }),
    );
    const out = (await screenFeeds.run({ subjects: ["Acme Ltd"] }, ctx)) as {
      verdict: string;
      flagged: { source: string }[];
    };
    expect(out.verdict).toBe("FLAGGED");
    expect(out.flagged).toHaveLength(1);
    expect(out.flagged[0].source).toBe("sanctions");
  });
});
