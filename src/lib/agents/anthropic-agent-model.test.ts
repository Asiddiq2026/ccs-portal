import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAnthropicAgentModel, extractJson } from "./anthropic-agent-model";
import { MissingApiKeyError } from "../fp/anthropic-client";

// Every test drives the adapter against a scripted fetch — no network, no API
// key spend. Each queued item is one Messages API response.
function mockApi(responses: unknown[]) {
  const calls: any[] = [];
  const fetchMock = vi.fn(async (_url: string, init: any) => {
    calls.push(JSON.parse(init.body));
    const next = responses.shift() ?? { content: [], stop_reason: "end_turn" };
    return { ok: true, json: async () => next } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

const usage = { input_tokens: 10, output_tokens: 5 };

function submitBlock(input: unknown) {
  return {
    content: [{ type: "tool_use", id: "t1", name: "submit_report", input }],
    stop_reason: "tool_use",
    usage,
  };
}

const RUN_ARGS = {
  system: "SYSTEM PROMPT",
  input: { trigger: "MANUAL", payload: {} },
  tools: ["query_database", "compute_dates", "write_register_entry", "enqueue_for_signoff"],
  callTool: async () => ({ ok: true }),
};

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("extractJson", () => {
  it("finds JSON inside prose and code fences", () => {
    expect(extractJson('Here is my result:\n```json\n{"verdict":"DRAFT READY"}\n```\nDone.')).toEqual({
      verdict: "DRAFT READY",
    });
    expect(extractJson('Analysis... {"a":1} ...trailing text')).toEqual({ a: 1 });
  });

  it("handles braces inside strings and nested objects", () => {
    expect(extractJson('{"summary":"a } brace","nested":{"x":[1,2]}}')).toEqual({
      summary: "a } brace",
      nested: { x: [1, 2] },
    });
  });

  it("returns undefined when there is nothing parseable", () => {
    expect(extractJson("no json at all")).toBeUndefined();
    expect(extractJson("{ not: valid json ")).toBeUndefined();
  });
});

describe("anthropic agent model — structured return channel", () => {
  it("offers submit_report alongside the agent's whitelisted tools", async () => {
    const { calls } = mockApi([submitBlock({ verdict: "OPERATOR REVIEW", summary: "none" })]);
    await createAnthropicAgentModel().run(RUN_ARGS as any);
    const offered = calls[0].tools.map((t: any) => t.name);
    expect(offered).toContain("submit_report");
    expect(offered).toContain("enqueue_for_signoff");
    // Withheld tools are never offered.
    expect(offered).not.toContain("send_email");
  });

  it("returns the submit_report input verbatim as the run output", async () => {
    const report = {
      verdict: "DRAFT READY",
      summary: "Drafted the Q1 CF30 chase.",
      findings: ["CF30 due 2026-04-16"],
      enqueued: [{ draftId: "d1", register: "cf30_return" }],
    };
    mockApi([submitBlock(report)]);
    const res = await createAnthropicAgentModel().run(RUN_ARGS as any);
    expect(res.output).toEqual(report);
    expect(res.tokens).toBe(15);
  });

  it("never dispatches submit_report through the gateway", async () => {
    mockApi([submitBlock({ verdict: "OPERATOR REVIEW", summary: "halt" })]);
    const callTool = vi.fn(async () => ({ ok: true }));
    await createAnthropicAgentModel().run({ ...RUN_ARGS, callTool } as any);
    expect(callTool).not.toHaveBeenCalled();
  });

  it("relays real tool calls to the gateway, then accepts the final report", async () => {
    mockApi([
      {
        content: [{ type: "tool_use", id: "a1", name: "compute_dates", input: { quarterEndDate: "2026-03-31" } }],
        stop_reason: "tool_use",
        usage,
      },
      submitBlock({ verdict: "DRAFT READY", summary: "ok", enqueued: [] }),
    ]);
    const callTool = vi.fn(async () => ({ cf30Due: "2026-04-16" }));
    const res = await createAnthropicAgentModel().run({ ...RUN_ARGS, callTool } as any);
    expect(callTool).toHaveBeenCalledWith("compute_dates", { quarterEndDate: "2026-03-31" });
    expect((res.output as any).verdict).toBe("DRAFT READY");
  });

  it("reports a denied tool back to the model instead of throwing", async () => {
    mockApi([
      {
        content: [{ type: "tool_use", id: "a1", name: "send_email", input: {} }],
        stop_reason: "tool_use",
        usage,
      },
      submitBlock({ verdict: "OPERATOR REVIEW", summary: "tool denied" }),
    ]);
    const callTool = vi.fn(async () => {
      throw new Error("403 tool denied: send_email");
    });
    const res = await createAnthropicAgentModel().run({ ...RUN_ARGS, callTool } as any);
    expect((res.output as any).verdict).toBe("OPERATOR REVIEW");
  });
});

describe("anthropic agent model — text fallback and repair", () => {
  it("accepts a valid JSON object embedded in a prose reply", async () => {
    mockApi([
      {
        content: [{ type: "text", text: 'Result:\n```json\n{"verdict":"DRAFT READY","summary":"ok"}\n```' }],
        stop_reason: "end_turn",
        usage,
      },
    ]);
    const res = await createAnthropicAgentModel().run(RUN_ARGS as any);
    expect((res.output as any).verdict).toBe("DRAFT READY");
  });

  it("asks once for a proper submit_report when the reply is unusable, then succeeds", async () => {
    const { calls } = mockApi([
      { content: [{ type: "text", text: "I think everything looks fine." }], stop_reason: "end_turn", usage },
      submitBlock({ verdict: "OPERATOR REVIEW", summary: "recovered" }),
    ]);
    const res = await createAnthropicAgentModel().run(RUN_ARGS as any);
    expect((res.output as any).summary).toBe("recovered");
    // The corrective turn was sent.
    const lastMsg = calls[1].messages.at(-1);
    expect(JSON.stringify(lastMsg)).toContain("submit_report");
  });

  it("treats a truncated reply (max_tokens) as recoverable", async () => {
    const { calls } = mockApi([
      { content: [{ type: "text", text: '{"verdict":"DRAFT RE' }], stop_reason: "max_tokens", usage },
      submitBlock({ verdict: "OPERATOR REVIEW", summary: "retried after truncation" }),
    ]);
    const res = await createAnthropicAgentModel().run(RUN_ARGS as any);
    expect((res.output as any).summary).toBe("retried after truncation");
    expect(JSON.stringify(calls[1].messages.at(-1))).toContain("cut off");
  });

  it("fails closed to OPERATOR REVIEW when even the repair turn is unusable", async () => {
    mockApi([
      { content: [{ type: "text", text: "still prose" }], stop_reason: "end_turn", usage },
      { content: [{ type: "text", text: "more prose" }], stop_reason: "end_turn", usage },
    ]);
    const res = await createAnthropicAgentModel().run(RUN_ARGS as any);
    const out = res.output as any;
    expect(out.verdict).toBe("OPERATOR REVIEW");
    expect(out.enqueued).toEqual([]);
    expect(out.summary).toMatch(/did not return a usable result/i);
    expect(out.findings[0]).toContain("more prose");
  });
});

describe("anthropic agent model — configuration", () => {
  it("throws MissingApiKeyError when no key is configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockApi([]);
    await expect(createAnthropicAgentModel().run(RUN_ARGS as any)).rejects.toBeInstanceOf(
      MissingApiKeyError,
    );
  });

  it("offers schemas for the formerly-missing tools (screen_feeds, compile_pack, gather_docs)", async () => {
    const { calls } = mockApi([submitBlock({ verdict: "OPERATOR REVIEW", summary: "x" })]);
    await createAnthropicAgentModel().run({
      ...RUN_ARGS,
      tools: ["query_database", "screen_feeds", "compile_pack", "gather_docs"],
    } as any);
    const offered = calls[0].tools.map((t: any) => t.name);
    for (const t of ["screen_feeds", "compile_pack", "gather_docs"]) {
      expect(offered).toContain(t);
    }
  });
});
