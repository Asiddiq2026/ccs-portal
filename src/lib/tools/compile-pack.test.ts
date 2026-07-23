import { describe, it, expect } from "vitest";
import { compilePack } from "./compile-pack";
import { validateArtifactPayload } from "../signoff/artifacts";
import type { ToolContext } from "./types";

// In-memory deps: no DB. Records the artifact created + audit rows.
function makeCtx(agentId = "agent-pre-meeting-prep") {
  const artifacts: Array<{ id: string; artifactType: string; arId: string; payload: Record<string, unknown>; summary: string }> = [];
  const audited: { action: string; entity: string; entityId?: string }[] = [];
  let n = 0;
  const ctx: ToolContext = {
    agentId,
    tenant: { role: "COMPLIANCE", arId: "ar_six" },
    deps: {
      audit: {
        append: async (e) => {
          audited.push({ action: e.action, entity: e.entity, entityId: e.entityId });
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

describe("compile_pack — oversight prep pack artifact", () => {
  it("files a PENDING review_pack with the caller's sections, never a FINAL row", async () => {
    const { ctx, artifacts, audited } = makeCtx();
    const out = (await compilePack.run(
      {
        arId: "ar_six",
        meetingDate: "2026-08-01",
        sections: [
          { heading: "Open financial promotions", lines: ["FP-0007 PENDING", "FP-0009 PENDING"] },
          { heading: "CF30 status", lines: ["Q2 filed for adoption"] },
        ],
      },
      ctx,
    )) as { id: string; status: string; artifactType: string };

    expect(out.status).toBe("PENDING");
    expect(out.artifactType).toBe("review_pack");
    expect(artifacts).toHaveLength(1);

    const pack = artifacts[0];
    expect(pack.artifactType).toBe("review_pack");
    expect(pack.arId).toBe("ar_six");
    expect(pack.payload.kind).toBe("oversight_prep");
    expect(pack.payload.meetingDate).toBe("2026-08-01");
    expect((pack.payload.sections as unknown[]).length).toBe(2);
    expect(pack.summary).toContain("2 sections");

    // The payload validates against the artifact schema (so sign-off can approve it).
    expect(validateArtifactPayload("review_pack", pack.payload).ok).toBe(true);

    // Audited as a PENDING draft — no FINAL / register-write action.
    expect(audited.some((a) => a.action === "ARTIFACT DRAFTED (PENDING)" && a.entity === "review_pack")).toBe(true);
    expect(audited.some((a) => a.action.includes("FINAL"))).toBe(false);
  });

  it("rejects an empty sections list (Zod)", async () => {
    const { ctx } = makeCtx();
    await expect(
      compilePack.input.parseAsync({ arId: "ar_six", sections: [] }),
    ).rejects.toBeTruthy();
    void ctx;
  });
});
