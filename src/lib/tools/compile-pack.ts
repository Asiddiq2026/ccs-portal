import { z } from "zod";
import type { Tool } from "./types";

/**
 * compile_pack — COMPUTE. Assembles an oversight-meeting prep pack for
 * agent-pre-meeting-prep. It is deliberately pure: it does NOT read the database
 * or invent facts — the agent gathers the material with query_database first and
 * hands the established sections in here (mirroring draft_template's "facts as
 * established by the caller"). This tool only *formats* them into an immutable
 * pack and files it as a PENDING sign-off ARTIFACT (register "review_pack").
 *
 * It never writes a FINAL register row (Invariants 1 & 3): a pack is not a
 * regulated fact, so approving it at sign-off is an operator acknowledgement,
 * not a materialisation. enqueue_for_signoff (the sole egress) routes the draft
 * to the human queue — this tool has no send/file capability.
 */
export const compilePack: Tool = {
  name: "compile_pack",
  kind: "COMPUTE",
  input: z.object({
    arId: z.string().min(1),
    /** Optional meeting date the pack is prepared for (ISO). */
    meetingDate: z.string().optional(),
    /** Pack sections — established by the caller from query_database results. */
    sections: z
      .array(
        z.object({
          heading: z.string().min(1),
          lines: z.array(z.string()).default([]),
        }),
      )
      .min(1),
  }),
  output: z.object({
    id: z.string(),
    status: z.literal("PENDING"),
    artifactType: z.literal("review_pack"),
  }),
  async run(input, ctx) {
    const generatedAt = new Date().toISOString();
    const payload = {
      arId: input.arId,
      kind: "oversight_prep" as const,
      generatedAt,
      ...(input.meetingDate ? { meetingDate: input.meetingDate } : {}),
      sections: input.sections.map((s: { heading: string; lines: string[] }) => ({
        heading: s.heading,
        lines: s.lines,
      })),
    };
    const summary = `Oversight prep pack for ${input.arId} — ${input.sections.length} section${
      input.sections.length === 1 ? "" : "s"
    }${input.meetingDate ? ` · meeting ${input.meetingDate}` : ""}`;

    const draft = await ctx.deps.store.createPendingArtifact(
      {
        artifactType: "review_pack",
        arId: input.arId,
        payload,
        summary,
        agentId: ctx.agentId,
        createdBy: ctx.agentId,
      },
      ctx.tenant,
    );
    await ctx.deps.audit.append(
      { actor: ctx.agentId, action: "ARTIFACT DRAFTED (PENDING)", entity: "review_pack", entityId: draft.id },
      ctx.tenant,
    );
    return { id: draft.id, status: "PENDING", artifactType: "review_pack" };
  },
};
