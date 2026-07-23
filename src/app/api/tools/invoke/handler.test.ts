import { describe, it, expect } from "vitest";
import { handleInvoke } from "./handler";
import type { Tenant, ToolDeps } from "@/lib/tools/types";

// In-memory deps so the endpoint runs end-to-end (session -> gateway -> tool)
// with no database and no Auth.js.
function makeDeps() {
  const audited: { action: string; entityId?: string }[] = [];
  const drafts = new Map<string, { id: string; status: string; arId: string }>();
  let n = 0;

  const deps: ToolDeps = {
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
  };
  return { deps, audited, drafts };
}

const COMPLIANCE: Tenant = { role: "COMPLIANCE", arId: "ar_six" };

describe("POST /api/tools/invoke — handleInvoke", () => {
  it("200s a valid compute tool call and returns the result", async () => {
    const { deps } = makeDeps();
    const res = await handleInvoke(COMPLIANCE, deps, {
      agentId: "agent-quarterly-cycle",
      tool: "compute_dates",
      input: { quarterEndDate: "2026-03-31" },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, result: { cf30Due: "2026-04-16" } });
  });

  it("routes a write through to a PENDING draft (never FINAL)", async () => {
    const { deps } = makeDeps();
    const res = await handleInvoke(COMPLIANCE, deps, {
      agentId: "agent-quarterly-cycle",
      tool: "write_register_entry",
      input: {
        register: "cf30_return",
        arId: "ar_six",
        data: { quarter: "2026-Q1" },
        summary: "Q1 CF30 chase draft",
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, result: { status: "PENDING" } });
  });

  it("403s a withheld tool and writes a TOOL DENIED audit row", async () => {
    const { deps, audited } = makeDeps();
    const res = await handleInvoke(COMPLIANCE, deps, {
      agentId: "agent-quarterly-cycle",
      tool: "send_email",
      input: {},
    });
    expect(res.status).toBe(403);
    expect(audited.some((a) => a.action === "TOOL DENIED" && a.entityId === "send_email")).toBe(true);
  });

  it("403s a real tool that is off the calling agent's whitelist", async () => {
    const { deps } = makeDeps();
    const res = await handleInvoke(COMPLIANCE, deps, {
      agentId: "agent-pre-meeting-prep", // cannot write_register_entry
      tool: "write_register_entry",
      input: { register: "cf30_return", arId: "ar_six", data: {}, summary: "x" },
    });
    expect(res.status).toBe(403);
  });

  it("dispatches a formerly-reserved tool (screen_feeds) and fails closed to OPERATOR_REVIEW", async () => {
    // RESERVED_TOOLS is now empty: screen_feeds is implemented and whitelisted
    // for agent-anomaly, so it dispatches instead of 501ing. With no FeedScreener
    // injected (makeDeps supplies none), it fails closed to OPERATOR_REVIEW — no
    // write, no egress — and the endpoint returns 200 with that verdict.
    const { deps } = makeDeps();
    const res = await handleInvoke(COMPLIANCE, deps, {
      agentId: "agent-anomaly",
      tool: "screen_feeds",
      input: { subjects: ["ACME Capital Ltd"] },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, result: { verdict: "OPERATOR_REVIEW" } });
  });

  it("400s a malformed request body", async () => {
    const { deps } = makeDeps();
    const res = await handleInvoke(COMPLIANCE, deps, { agentId: "agent-quarterly-cycle" });
    expect(res.status).toBe(400);
  });

  it("400s invalid tool input (Zod) without reaching the store", async () => {
    const { deps } = makeDeps();
    const res = await handleInvoke(COMPLIANCE, deps, {
      agentId: "agent-quarterly-cycle",
      tool: "compute_dates",
      input: { quarterEndDate: 12345 }, // wrong type
    });
    expect(res.status).toBe(400);
  });
});
