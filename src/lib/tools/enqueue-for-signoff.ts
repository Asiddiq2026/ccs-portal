import { z } from "zod";
import { ToolDeniedError, type Tool } from "./types";

/**
 * enqueue_for_signoff — EGRESS. The ONLY route out of the platform (Invariant
 * 3). It routes an existing PENDING draft to the human Sign-Off Queue and writes
 * an ENQUEUED audit row. It performs no email, filing, or FINAL persistence.
 */
export const enqueueForSignoff: Tool = {
  name: "enqueue_for_signoff",
  kind: "EGRESS",
  input: z.object({
    draftId: z.string().min(1),
  }),
  output: z.object({
    queued: z.literal(true),
    ref: z.string(),
    status: z.literal("PENDING"),
  }),
  async run(input, ctx) {
    const draft = await ctx.deps.store.getDraft(input.draftId, ctx.tenant);
    if (!draft) {
      throw new ToolDeniedError(
        "enqueue_for_signoff",
        "draft not found or not visible to caller",
      );
    }
    if (draft.status !== "PENDING") {
      throw new ToolDeniedError(
        "enqueue_for_signoff",
        `draft is ${draft.status}, not PENDING`,
      );
    }
    await ctx.deps.audit.append(
      {
        actor: ctx.agentId,
        action: "ENQUEUED",
        entity: "sign_off_item",
        entityId: draft.id,
      },
      ctx.tenant,
    );
    return { queued: true, ref: draft.id, status: "PENDING" };
  },
};
