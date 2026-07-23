import { describe, it, expect } from "vitest";
import { invokeTool } from "./gateway";
import {
  WITHHELD_TOOLS,
  RESERVED_TOOLS,
  TOOL_REGISTRY,
} from "./registry";
import { AGENT_SPECS } from "../agents/specs";
import {
  ToolDeniedError,
  ToolUnavailableError,
  type ToolContext,
} from "./types";

// In-memory deps so the gateway + tools run with no database.
function makeCtx(agentId: string) {
  const audited: { action: string; entityId?: string }[] = [];
  const drafts = new Map<string, { id: string; status: string; arId: string }>();
  let n = 0;

  const ctx: ToolContext = {
    agentId,
    tenant: { role: "COMPLIANCE", arId: "ar_six" },
    deps: {
      audit: {
        append: async (e) => {
          audited.push({ action: e.action, entityId: e.entityId });
          return { id: `a${++n}` };
        },
      },
      store: {
        query: async () => [{ id: "row-1" }],
        createPendingDraft: async (input) => {
          const id = `d${++n}`;
          drafts.set(id, { id, status: "PENDING", arId: input.arId });
          return { id, status: "PENDING" };
        },
        createPendingArtifact: async (input) => {
          const id = `p${++n}`;
          drafts.set(id, { id, status: "PENDING", arId: input.arId });
          return { id, status: "PENDING" };
        },
        getDraft: async (id) => drafts.get(id) ?? null,
      },
      // No `feeds` wired — screen_feeds must fail closed to OPERATOR_REVIEW.
    },
  };
  return { ctx, audited, drafts };
}

describe("Invariant 2 — withheld tools are absent from every agent registry", () => {
  it("no agent whitelist contains any withheld tool", () => {
    for (const agent of AGENT_SPECS) {
      for (const withheld of WITHHELD_TOOLS) {
        expect(agent.tools).not.toContain(withheld);
      }
    }
  });

  it("withheld tools have no implementation in TOOL_REGISTRY", () => {
    for (const withheld of WITHHELD_TOOLS) {
      expect(TOOL_REGISTRY[withheld]).toBeUndefined();
    }
  });

  it("every whitelisted tool is either implemented or explicitly reserved", () => {
    const known = new Set([
      ...Object.keys(TOOL_REGISTRY),
      ...RESERVED_TOOLS,
    ]);
    for (const agent of AGENT_SPECS) {
      for (const tool of agent.tools) {
        expect(known.has(tool)).toBe(true);
      }
    }
  });
});

describe("Invariant 3 — enqueue_for_signoff is the sole egress", () => {
  it("every agent has exactly enqueue_for_signoff as its egress tool", () => {
    for (const agent of AGENT_SPECS) {
      expect(agent.tools).toContain("enqueue_for_signoff");
      // No other egress-capable tool exists on any whitelist.
      expect(agent.tools).not.toContain("send_email");
      expect(agent.tools).not.toContain("file_regulatory");
      expect(agent.tools).not.toContain("persist_final");
    }
  });
});

describe("gateway — withheld-tool rejection", () => {
  for (const withheld of WITHHELD_TOOLS) {
    it(`rejects ${withheld} with 403 and writes a TOOL DENIED audit row`, async () => {
      const { ctx, audited } = makeCtx("agent-quarterly-cycle");
      await expect(invokeTool(ctx, withheld, {})).rejects.toBeInstanceOf(
        ToolDeniedError,
      );
      await expect(invokeTool(ctx, withheld, {})).rejects.toMatchObject({
        status: 403,
      });
      expect(audited.some((a) => a.action === "TOOL DENIED" && a.entityId === withheld)).toBe(true);
    });
  }
});

describe("gateway — whitelist enforcement", () => {
  it("denies a real tool that is not on the calling agent's whitelist", async () => {
    // agent-pre-meeting-prep cannot write_register_entry.
    const { ctx } = makeCtx("agent-pre-meeting-prep");
    await expect(
      invokeTool(ctx, "write_register_entry", {
        register: "cf30_return",
        arId: "ar_six",
        data: {},
        summary: "x",
      }),
    ).rejects.toBeInstanceOf(ToolDeniedError);
  });

  it("denies calls from an unknown agent", async () => {
    const { ctx } = makeCtx("agent-does-not-exist");
    await expect(invokeTool(ctx, "query_database", { table: "cf30_return" })).rejects.toBeInstanceOf(
      ToolDeniedError,
    );
  });

  it("dispatches a formerly-reserved tool now that it is implemented", async () => {
    // agent-anomaly whitelists screen_feeds (previously reserved → 501). It now
    // dispatches; with no screener wired it fails closed to OPERATOR_REVIEW.
    const { ctx } = makeCtx("agent-anomaly");
    const out = (await invokeTool(ctx, "screen_feeds", { subjects: ["Acme Ltd"] })) as {
      verdict: string;
    };
    expect(out.verdict).toBe("OPERATOR_REVIEW");
  });

  it("RESERVED_TOOLS is empty — the 501 path exists but nothing triggers it", () => {
    expect(RESERVED_TOOLS).toHaveLength(0);
    // The gateway still throws ToolUnavailableError for reserved names; retained
    // as a contract for any future capability gap.
    expect(ToolUnavailableError).toBeTypeOf("function");
  });
});

describe("artifact tools land PENDING via the sign-off queue (no FINAL row)", () => {
  it("compile_pack creates a PENDING review_pack that enqueue_for_signoff can route", async () => {
    const { ctx, audited } = makeCtx("agent-pre-meeting-prep");
    const pack = (await invokeTool(ctx, "compile_pack", {
      arId: "ar_six",
      sections: [{ heading: "Open FPs", lines: ["FP-0007 PENDING"] }],
    })) as { id: string; status: string; artifactType: string };
    expect(pack.status).toBe("PENDING");
    expect(pack.artifactType).toBe("review_pack");

    const res = (await invokeTool(ctx, "enqueue_for_signoff", { draftId: pack.id })) as {
      queued: boolean;
    };
    expect(res.queued).toBe(true);
    expect(audited.some((a) => a.action === "ENQUEUED")).toBe(true);
  });

  it("gather_docs creates a PENDING evidence_pack", async () => {
    const { ctx } = makeCtx("agent-evidence-packer");
    const pack = (await invokeTool(ctx, "gather_docs", {
      arId: "ar_six",
      purpose: "Q2 review",
      docs: [{ name: "note.pdf", sha256: "a".repeat(64) }],
    })) as { status: string; artifactType: string };
    expect(pack.status).toBe("PENDING");
    expect(pack.artifactType).toBe("evidence_pack");
  });

  it("compile_pack is refused for an agent whose whitelist omits it", async () => {
    // agent-quarterly-cycle has no compile_pack on its whitelist.
    const { ctx } = makeCtx("agent-quarterly-cycle");
    await expect(
      invokeTool(ctx, "compile_pack", { arId: "ar_six", sections: [{ heading: "x", lines: [] }] }),
    ).rejects.toBeInstanceOf(ToolDeniedError);
  });
});

describe("Invariant 1 — writes land PENDING via the tool layer", () => {
  it("write_register_entry returns status PENDING (never FINAL)", async () => {
    const { ctx } = makeCtx("agent-quarterly-cycle");
    const out = (await invokeTool(ctx, "write_register_entry", {
      register: "cf30_return",
      arId: "ar_six",
      data: { quarter: "2026-Q1" },
      summary: "Q1 CF30 chase draft",
    })) as { id: string; status: string };
    expect(out.status).toBe("PENDING");
    expect(out.id).toBeTruthy();
  });

  it("enqueue_for_signoff routes a PENDING draft and audits ENQUEUED", async () => {
    const { ctx, audited } = makeCtx("agent-quarterly-cycle");
    const draft = (await invokeTool(ctx, "write_register_entry", {
      register: "cf30_return",
      arId: "ar_six",
      data: { quarter: "2026-Q1" },
      summary: "Q1 CF30 chase draft",
    })) as { id: string };

    const res = (await invokeTool(ctx, "enqueue_for_signoff", {
      draftId: draft.id,
    })) as { queued: boolean; ref: string; status: string };

    expect(res.queued).toBe(true);
    expect(res.ref).toBe(draft.id);
    expect(res.status).toBe("PENDING");
    expect(audited.some((a) => a.action === "ENQUEUED")).toBe(true);
  });

  it("enqueue_for_signoff refuses an unknown draft", async () => {
    const { ctx } = makeCtx("agent-quarterly-cycle");
    await expect(
      invokeTool(ctx, "enqueue_for_signoff", { draftId: "nope" }),
    ).rejects.toBeInstanceOf(ToolDeniedError);
  });
});

describe("compute tools are pure (no egress, no DB)", () => {
  it("compute_dates returns the CF30 due date via the engine", async () => {
    const { ctx } = makeCtx("agent-quarterly-cycle");
    const out = (await invokeTool(ctx, "compute_dates", {
      quarterEndDate: "2026-03-31",
    })) as { cf30Due: string };
    expect(out.cf30Due).toBe("2026-04-16");
  });
});
