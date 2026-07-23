import { describe, it, expect } from "vitest";
import { invokeTool } from "./gateway";
import { RESERVED_TOOLS, TOOL_REGISTRY } from "./registry";
import { draftTemplate } from "./draft-template";
import { ToolUnavailableError, type ToolContext } from "./types";

// Minimal in-memory ctx; draft_template is pure COMPUTE so deps are unused,
// but the gateway still requires a context to enforce the whitelist.
function makeCtx(agentId: string): ToolContext {
  return {
    agentId,
    tenant: { role: "COMPLIANCE", arId: "ar_six" },
    deps: {
      audit: { append: async () => ({ id: "a1" }) },
      store: {
        query: async () => [],
        createPendingDraft: async () => ({ id: "d1", status: "PENDING" }),
        createPendingArtifact: async () => ({ id: "p1", status: "PENDING" }),
        getDraft: async () => null,
      },
    },
  };
}

describe("draft_template — registration", () => {
  it("is implemented (in TOOL_REGISTRY) and no longer reserved", () => {
    expect(TOOL_REGISTRY["draft_template"]).toBe(draftTemplate);
    expect((RESERVED_TOOLS as readonly string[]).includes("draft_template")).toBe(false);
  });

  it("is dispatched (not 501) for agent-notification-drafter", async () => {
    const ctx = makeCtx("agent-notification-drafter");
    const out = (await invokeTool(ctx, "draft_template", {
      kind: "SUP15",
      firm: "ar_six",
      subject: "Late CF30 return",
      facts: "The Q1 CF30 return is 14 days overdue.",
    })) as { doNotSend: boolean };
    expect(out.doNotSend).toBe(true);
  });
});

describe("draft_template — pure rendering", () => {
  it("renders every draft as DO-NOT-SEND with the regulatory basis", async () => {
    const ctx = makeCtx("agent-notification-drafter");
    for (const kind of ["SUP15", "PRINCIPLE11", "ICO_ART33"] as const) {
      const out = (await invokeTool(ctx, "draft_template", {
        kind,
        firm: "ar_drake_star",
        subject: "Test subject",
        facts: "Established facts.",
      })) as { doNotSend: boolean; body: string; references: string[]; title: string };
      expect(out.doNotSend).toBe(true);
      expect(out.body).toContain("DRAFT — DO NOT SEND");
      expect(out.references.length).toBeGreaterThan(0);
      expect(out.title).toContain("Test subject");
    }
  });

  it("computes the ICO Article 33 72h deadline in code from awareAt", async () => {
    const ctx = makeCtx("agent-notification-drafter");
    const out = (await invokeTool(ctx, "draft_template", {
      kind: "ICO_ART33",
      firm: "ar_six",
      subject: "Personal data breach",
      facts: "Client PII exposed via misconfigured share.",
      awareAt: "2026-07-20T09:00:00.000Z",
    })) as { deadline?: string };
    // 72h after 2026-07-20T09:00Z = 2026-07-23T09:00Z.
    expect(out.deadline).toBe("2026-07-23T09:00:00.000Z");
  });

  it("flags an unparseable awareAt rather than inventing a deadline", async () => {
    const ctx = makeCtx("agent-notification-drafter");
    const out = (await invokeTool(ctx, "draft_template", {
      kind: "ICO_ART33",
      firm: "ar_six",
      subject: "Breach",
      facts: "Facts.",
      awareAt: "not-a-date",
    })) as { deadline?: string };
    expect(out.deadline).toMatch(/UNKNOWN/);
  });

  it("omits the deadline for non-ICO notification kinds", async () => {
    const ctx = makeCtx("agent-notification-drafter");
    const out = (await invokeTool(ctx, "draft_template", {
      kind: "PRINCIPLE11",
      firm: "ar_six",
      subject: "Open disclosure",
      facts: "Facts.",
      awareAt: "2026-07-20T09:00:00.000Z",
    })) as { deadline?: string };
    expect(out.deadline).toBeUndefined();
  });
});

describe("draft_template — still unreachable for agents that do not whitelist it", () => {
  it("agent-anomaly cannot call draft_template", async () => {
    const ctx = makeCtx("agent-anomaly");
    // Not on agent-anomaly's whitelist → denied, never dispatched.
    await expect(invokeTool(ctx, "draft_template", {
      kind: "SUP15",
      firm: "ar_six",
      subject: "x",
      facts: "y",
    })).rejects.not.toBeInstanceOf(ToolUnavailableError);
  });
});
