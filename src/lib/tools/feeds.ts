// Adverse-media / sanctions screener adapters for screen_feeds.
//
// No vendor is chosen yet, so the production wiring uses a FAIL-CLOSED STUB: it
// reports ok:false, which screen_feeds maps to OPERATOR_REVIEW (never a silent
// CLEAR). This keeps the tool live-but-honest — it runs, it audits its own
// limitation, and it escalates to a human — until a real provider is wired.
//
// To go live: implement a FeedScreener that calls the chosen provider's API
// (server-side, keyed via env) and returns ok:true with real hits, then swap it
// into prismaToolDeps.feeds. screen_feeds itself needs no change.
import type { FeedScreener, FeedScreenResult } from "./types";

export const stubFeedScreener: FeedScreener = {
  async screen(): Promise<FeedScreenResult> {
    return {
      ok: false,
      provider: "stub — no adverse-media provider configured",
      hits: [],
    };
  },
};
