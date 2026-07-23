import { z } from "zod";
import type { Tool, FeedHit } from "./types";

/**
 * screen_feeds — READ. Adverse-media / sanctions screening for agent-anomaly.
 * It calls an injected external screener (deps.feeds) and returns structured
 * candidates; it writes NOTHING. Turning a flag into a register draft is the
 * agent's own write_register_entry step, which lands PENDING for sign-off.
 *
 * Determinism (Invariant 7): the provider supplies a confidence score, but the
 * decision of what counts as a flag is a CODED threshold here, not model
 * judgement. Fail-closed (Invariant 9): if no screener is wired, or the provider
 * errors / is unavailable, the verdict is OPERATOR_REVIEW — never a silent
 * "CLEAR". The agent runner halts fail-closed on OPERATOR_REVIEW.
 */

/** Coded flag threshold — a hit at or above this confidence is surfaced. */
export const FEED_FLAG_THRESHOLD = 75;

export const screenFeeds: Tool = {
  name: "screen_feeds",
  kind: "READ",
  input: z.object({
    subjects: z.array(z.string().min(1)).min(1),
    arId: z.string().optional(),
  }),
  output: z.object({
    verdict: z.enum(["CLEAR", "FLAGGED", "OPERATOR_REVIEW"]),
    provider: z.string(),
    threshold: z.number(),
    screened: z.number(),
    reason: z.string().optional(),
    flagged: z.array(
      z.object({
        subject: z.string(),
        source: z.string(),
        matchScore: z.number(),
        summary: z.string(),
      }),
    ),
  }),
  async run(input, ctx) {
    const base = { threshold: FEED_FLAG_THRESHOLD, screened: input.subjects.length, flagged: [] as FeedHit[] };

    // No screener configured → fail closed.
    if (!ctx.deps.feeds) {
      return {
        ...base,
        verdict: "OPERATOR_REVIEW" as const,
        provider: "none — unconfigured",
        reason: "No adverse-media provider is wired; screening cannot run. Escalated for manual review.",
      };
    }

    let result;
    try {
      result = await ctx.deps.feeds.screen(input.subjects, ctx.tenant);
    } catch (e) {
      // Provider error → fail closed, never a silent CLEAR.
      return {
        ...base,
        verdict: "OPERATOR_REVIEW" as const,
        provider: "error",
        reason: `Screening provider error: ${(e as Error).message}. Escalated for manual review.`,
      };
    }

    if (!result.ok) {
      return {
        ...base,
        verdict: "OPERATOR_REVIEW" as const,
        provider: result.provider,
        reason: "Screening provider returned no usable result. Escalated for manual review.",
      };
    }

    // Coded threshold decides what is a flag — not the model.
    const flagged = result.hits.filter((h) => h.matchScore >= FEED_FLAG_THRESHOLD);
    return {
      ...base,
      verdict: flagged.length > 0 ? ("FLAGGED" as const) : ("CLEAR" as const),
      provider: result.provider,
      flagged,
    };
  },
};
