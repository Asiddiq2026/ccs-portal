import { describe, it, expect } from "vitest";
import { gatherDocs } from "./gather-docs";
import { validateArtifactPayload } from "../signoff/artifacts";
import type { ToolContext } from "./types";

function makeCtx(agentId = "agent-evidence-packer") {
  const artifacts: Array<{ id: string; artifactType: string; arId: string; payload: Record<string, unknown>; summary: string }> = [];
  const audited: { action: string; entity: string }[] = [];
  let n = 0;
  const ctx: ToolContext = {
    agentId,
    tenant: { role: "COMPLIANCE", arId: "ar_six" },
    deps: {
      audit: {
        append: async (e) => {
          audited.push({ action: e.action, entity: e.entity });
          return { id: `a${++n}` };
        },
      },
      store: {
        query: async () => [],
        createPendingDraft: async () => ({ id: `d${++n}`, status: "PENDING" as const }),
        createPendingArtifact: async (input) => {
          const id = `p${++n}`;
          artifacts.push({ id, artifactType: input.artifactType, arId: input.arId, payload: input.payload, summary: input.summary });
          return { id, status: "PENDING" as const };
        },
        getDraft: async () => null,
      },
    },
  };
  return { ctx, artifacts, audited };
}

describe("gather_docs — evidence pack artifact", () => {
  it("files a PENDING evidence_pack manifest of already-stored WORM docs", async () => {
    const { ctx, artifacts, audited } = makeCtx();
    const out = (await gatherDocs.run(
      {
        arId: "ar_six",
        purpose: "Q2 oversight review",
        docs: [
          { name: "promo-terms.pdf", sha256: "a".repeat(64), blobUrl: "worm://blob/1", size: 20480 },
          { name: "risk-note.pdf", sha256: "b".repeat(64) },
        ],
      },
      ctx,
    )) as { id: string; status: string; artifactType: string };

    expect(out.status).toBe("PENDING");
    expect(out.artifactType).toBe("evidence_pack");
    expect(artifacts).toHaveLength(1);

    const pack = artifacts[0];
    expect(pack.payload.purpose).toBe("Q2 oversight review");
    const docs = pack.payload.docs as Array<{ name: string; sha256: string }>;
    expect(docs).toHaveLength(2);
    expect(docs[0].sha256).toHaveLength(64); // tamper-evident hash preserved
    expect(pack.summary).toContain("2 documents");

    expect(validateArtifactPayload("evidence_pack", pack.payload).ok).toBe(true);
    expect(audited.some((a) => a.action === "ARTIFACT DRAFTED (PENDING)" && a.entity === "evidence_pack")).toBe(true);
  });

  it("rejects an empty docs list (Zod)", async () => {
    await expect(
      gatherDocs.input.parseAsync({ arId: "ar_six", purpose: "x", docs: [] }),
    ).rejects.toBeTruthy();
  });
});
