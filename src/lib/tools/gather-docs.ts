import { z } from "zod";
import type { Tool } from "./types";

/**
 * gather_docs — COMPUTE. Assembles an evidence pack for agent-evidence-packer:
 * a manifest of ALREADY-STORED WORM documents (from the promotion_document
 * manifest the agent read via query_database). It records each document's
 * SHA-256 so the pack is tamper-evident, and it NEVER uploads or fetches bytes —
 * document creation stays on the existing submission path, so this tool adds no
 * new WORM write.
 *
 * Like compile_pack it files the manifest as a PENDING sign-off ARTIFACT
 * (register "evidence_pack") and routes it via enqueue_for_signoff (the sole
 * egress). Approving the pack is an operator acknowledgement — never a FINAL
 * register write (Invariants 1 & 3).
 */
export const gatherDocs: Tool = {
  name: "gather_docs",
  kind: "COMPUTE",
  input: z.object({
    arId: z.string().min(1),
    /** Why this evidence is being gathered (e.g. "Q2 oversight review"). */
    purpose: z.string().min(1),
    /** References to already-stored WORM documents — never fetched here. */
    docs: z
      .array(
        z.object({
          name: z.string().min(1),
          sha256: z.string().min(1),
          blobUrl: z.string().optional(),
          size: z.coerce.number().int().nonnegative().optional(),
        }),
      )
      .min(1),
  }),
  output: z.object({
    id: z.string(),
    status: z.literal("PENDING"),
    artifactType: z.literal("evidence_pack"),
  }),
  async run(input, ctx) {
    const generatedAt = new Date().toISOString();
    const payload = {
      arId: input.arId,
      purpose: input.purpose,
      generatedAt,
      docs: input.docs.map(
        (d: { name: string; sha256: string; blobUrl?: string; size?: number }) => ({
          name: d.name,
          sha256: d.sha256,
          ...(d.blobUrl ? { blobUrl: d.blobUrl } : {}),
          ...(d.size !== undefined ? { size: d.size } : {}),
        }),
      ),
    };
    const summary = `Evidence pack for ${input.arId} — ${input.docs.length} document${
      input.docs.length === 1 ? "" : "s"
    }: ${input.purpose}`;

    const draft = await ctx.deps.store.createPendingArtifact(
      {
        artifactType: "evidence_pack",
        arId: input.arId,
        payload,
        summary,
        agentId: ctx.agentId,
        createdBy: ctx.agentId,
      },
      ctx.tenant,
    );
    await ctx.deps.audit.append(
      { actor: ctx.agentId, action: "ARTIFACT DRAFTED (PENDING)", entity: "evidence_pack", entityId: draft.id },
      ctx.tenant,
    );
    return { id: draft.id, status: "PENDING", artifactType: "evidence_pack" };
  },
};
