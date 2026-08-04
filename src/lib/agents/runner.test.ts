import { describe, it, expect } from "vitest";
import { runAgent, AgentError, type AgentModel, type AgentRunWriter } from "./runner";
import type { Tenant, ToolDeps } from "../tools/types";

// In-memory deps so the runner runs end-to-end (input validation -> model ->
// gateway-enforced tools -> output validation -> run log + audit) with no
// database, no Auth.js, and no network.
function makeDeps() {
  const audited: { actor: string; action: string; entity: string; entityId?: string }[] = [];
  const drafts = new Map<string, { id: string; status: string; arId: string }>();
  let n = 0;

  const deps: ToolDeps = {
    audit: {
      append: async (e) => {
        audited.push({ ...e });
        return { id: `a${++n}` };
      },
    },
    store: {
      query: async () => [{ id: "row-1", arId: "ar_six" }],
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

// A run log that records everything it is handed so tests can assert on the
// immutable AgentRun row shape (hashes, tokens, output).
function makeRunLog() {
  const rows: Parameters<AgentRunWriter["append"]>[0][] = [];
  const runLog: AgentRunWriter = {
    append: async (run) => {
      rows.push(run);
      return { id: `run-${rows.length}` };
    },
  };
  return { runLog, rows };
}

const COMPLIANCE: Tenant = { role: "COMPLIANCE", arId: "ar_six" };
const HEX64 = /^[0-9a-f]{64}$/;

describe("runAgent — fail-closed agent runner", () => {
  it("happy path: model drafts + enqueues, run is logged and audited AGENT RUN", async () => {
    const { deps, audited } = makeDeps();
    const { runLog, rows } = makeRunLog();

    // A cooperative model: write a PENDING draft, enqueue it, return DRAFT READY.
    const model: AgentModel = {
      async run({ callTool }) {
        const draft = (await callTool("write_register_entry", {
          register: "cf30_return",
          arId: "ar_six",
          data: { quarter: "2026-Q1" },
          summary: "Q1 CF30 chase draft",
        })) as { id: string };
        const eq = (await callTool("enqueue_for_signoff", { draftId: draft.id })) as {
          ref: string;
        };
        return {
          output: {
            verdict: "DRAFT READY",
            summary: "Drafted and enqueued the Q1 CF30 chase.",
            findings: ["CF30 due 2026-04-16"],
            enqueued: [{ draftId: eq.ref, register: "cf30_return" }],
          },
          tokens: 1234,
          model: "test-model",
        };
      },
    };

    const result = await runAgent({
      agentId: "agent-quarterly-cycle",
      tenant: COMPLIANCE,
      input: { trigger: "MANUAL", payload: {} },
      deps,
      model,
      runLog,
    });

    expect(result.verdict).toBe("DRAFT READY");
    expect(result.operatorReview).toBe(false);
    expect(result.enqueued).toHaveLength(1);
    expect(result.tokens).toBe(1234);

    // Immutable AgentRun row was written with stable 64-hex hashes.
    expect(rows).toHaveLength(1);
    expect(rows[0].agentId).toBe("agent-quarterly-cycle");
    expect(rows[0].version).toBe("v3");
    expect(rows[0].promptHash).toMatch(HEX64);
    expect(rows[0].inputHash).toMatch(HEX64);
    expect(rows[0].tokens).toBe(1234);

    // Audit trail: an AGENT RUN event on success (plus the tool-level events).
    expect(audited.some((a) => a.action === "AGENT RUN" && a.entity === "agent_run")).toBe(true);
    expect(audited.some((a) => a.action === "ENQUEUED")).toBe(true);
  });

  it("withheld tool is unreachable → gateway denies → fail-closed OPERATOR REVIEW", async () => {
    const { deps, audited } = makeDeps();
    const { runLog } = makeRunLog();

    // A rogue model that tries to reach a withheld tool. The gateway rejects it;
    // the model surfaces that as a thrown error, which fails the run closed.
    const model: AgentModel = {
      async run({ callTool }) {
        await callTool("send_email", { to: "regulator@example.com" }); // throws
        return {
          output: { verdict: "DRAFT READY", summary: "should never reach here" },
          tokens: 10,
          model: "test-model",
        };
      },
    };

    const result = await runAgent({
      agentId: "agent-quarterly-cycle",
      tenant: COMPLIANCE,
      input: { trigger: "MANUAL", payload: {} },
      deps,
      model,
      runLog,
    });

    expect(result.verdict).toBe("OPERATOR REVIEW");
    expect(result.operatorReview).toBe(true);
    expect(result.enqueued).toHaveLength(0);
    // The gateway recorded the denial, and the run was logged as OPERATOR REVIEW.
    expect(audited.some((a) => a.action === "TOOL DENIED" && a.entityId === "send_email")).toBe(true);
    expect(audited.some((a) => a.action === "OPERATOR REVIEW")).toBe(true);
  });

  it("output that fails the schema → OPERATOR REVIEW, no draft accepted", async () => {
    const { deps } = makeDeps();
    const { runLog } = makeRunLog();

    const model: AgentModel = {
      async run() {
        return {
          // Missing `summary`, invalid `verdict` — violates AgentOutputSchema.
          output: { verdict: "SHIP IT" },
          tokens: 42,
          model: "test-model",
        };
      },
    };

    const result = await runAgent({
      agentId: "agent-quarterly-cycle",
      tenant: COMPLIANCE,
      input: { trigger: "MANUAL", payload: {} },
      deps,
      model,
      runLog,
    });

    expect(result.verdict).toBe("OPERATOR REVIEW");
    expect(result.operatorReview).toBe(true);
    expect(result.summary).toMatch(/failed schema validation/i);
  });

  it("input that fails the schema → OPERATOR REVIEW before the model runs", async () => {
    const { deps } = makeDeps();
    const { runLog } = makeRunLog();
    let modelCalled = false;
    const model: AgentModel = {
      async run() {
        modelCalled = true;
        return { output: {}, tokens: 0, model: "test-model" };
      },
    };

    const result = await runAgent({
      agentId: "agent-quarterly-cycle",
      tenant: COMPLIANCE,
      input: { trigger: "NOT_A_TRIGGER" }, // invalid enum
      deps,
      model,
      runLog,
    });

    expect(modelCalled).toBe(false);
    expect(result.verdict).toBe("OPERATOR REVIEW");
    expect(result.operatorReview).toBe(true);
  });

  it("a thrown model error fails closed → OPERATOR REVIEW", async () => {
    const { deps } = makeDeps();
    const { runLog } = makeRunLog();
    const model: AgentModel = {
      async run() {
        throw new Error("model exploded");
      },
    };

    const result = await runAgent({
      agentId: "agent-quarterly-cycle",
      tenant: COMPLIANCE,
      input: { trigger: "MANUAL", payload: {} },
      deps,
      model,
      runLog,
    });

    expect(result.verdict).toBe("OPERATOR REVIEW");
    expect(result.operatorReview).toBe(true);
    expect(result.findings).toContain("model exploded");
  });

  it("unknown agent throws AgentError(404)", async () => {
    const { deps } = makeDeps();
    const { runLog } = makeRunLog();
    const model: AgentModel = {
      async run() {
        return { output: {}, tokens: 0, model: "test-model" };
      },
    };

    await expect(
      runAgent({
        agentId: "agent-does-not-exist",
        tenant: COMPLIANCE,
        input: { trigger: "MANUAL", payload: {} },
        deps,
        model,
        runLog,
      }),
    ).rejects.toMatchObject({ name: "AgentError", status: 404 });
  });

  it("AgentError carries the HTTP status for the route to map", () => {
    const err = new AgentError(404, "unknown agent: x");
    expect(err.status).toBe(404);
    expect(err).toBeInstanceOf(Error);
  });

  it("refuses a run BEFORE calling the model when the token budget is exhausted", async () => {
    const { deps } = makeDeps();
    const { runLog, rows } = makeRunLog();
    let modelCalled = false;
    const model: AgentModel = {
      async run() {
        modelCalled = true;
        return { output: { verdict: "DRAFT READY", summary: "x" }, tokens: 1, model: "test" };
      },
    };

    const result = await runAgent({
      agentId: "agent-quarterly-cycle",
      tenant: COMPLIANCE,
      input: { trigger: "MANUAL", payload: {} },
      deps,
      model,
      runLog,
      meter: { record: async () => {}, monthToDate: async () => 1_000_000 },
      modelBudget: 1_000_000,
    });

    expect(modelCalled).toBe(false); // the refusal costs nothing
    expect(result.verdict).toBe("OPERATOR REVIEW");
    expect(result.summary).toMatch(/budget exhausted \(1000000 of 1000000/);
    expect(result.tokens).toBe(0);
    // Still logged as an immutable run, so the refusal is auditable.
    expect(rows).toHaveLength(1);
  });

  it("records model spend in the usage ledger after a run", async () => {
    const { deps } = makeDeps();
    const { runLog } = makeRunLog();
    const usage: { source: string; tokens: number }[] = [];
    const model: AgentModel = {
      async run() {
        return {
          output: { verdict: "OPERATOR REVIEW", summary: "halted" },
          tokens: 4321,
          model: "test",
        };
      },
    };

    await runAgent({
      agentId: "agent-quarterly-cycle",
      tenant: COMPLIANCE,
      input: { trigger: "MANUAL", payload: {} },
      deps,
      model,
      runLog,
      meter: {
        record: async (u) => {
          usage.push({ source: u.source, tokens: u.tokens });
        },
        monthToDate: async () => 0,
      },
      modelBudget: 1_000_000,
    });

    // Spend is recorded even though the run fail-closed — tokens were consumed.
    expect(usage).toEqual([{ source: "agent_run", tokens: 4321 }]);
  });
});
