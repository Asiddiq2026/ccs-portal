// Server-only AgentModel backed by the Anthropic Messages API tool-use loop.
// The runner injects `callTool` (gateway-enforced), so this adapter never needs
// to know which tools are allowed — it only offers JSON schemas for the tools
// the runner passes and relays tool_use ↔ tool_result. No SDK dependency; plain
// fetch. The API key stays server-side.
import { MissingApiKeyError, ModelCallError } from "../fp/anthropic-client";
import type { AgentModel } from "./runner";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TURNS = 8; // bound the loop — runaway tool use fails closed.

// Minimal JSON Schemas for the *implemented* tools. Reserved (unimplemented)
// tools have no entry, so they are never offered to the model; if an agent
// needs one it will fail closed to OPERATOR REVIEW rather than act.
const TOOL_SCHEMAS: Record<string, { description: string; input_schema: Record<string, unknown> }> = {
  query_database: {
    description: "Read rows from a register the caller is scoped to.",
    input_schema: {
      type: "object",
      properties: { table: { type: "string" }, filter: { type: "object" } },
      required: ["table"],
    },
  },
  compute_dates: {
    description: "Deterministic CF30 due date + escalation ladder for a quarter-end date (YYYY-MM-DD).",
    input_schema: {
      type: "object",
      properties: { quarterEndDate: { type: "string" } },
      required: ["quarterEndDate"],
    },
  },
  compute_thresholds: {
    description: "Deterministic risk banding and CPD strike calculation.",
    input_schema: {
      type: "object",
      properties: {
        riskFactors: { type: "array", items: { type: "number" } },
        cpd: { type: "object" },
      },
    },
  },
  draft_template: {
    description:
      "Render a regulatory notification DRAFT (SUP15 | PRINCIPLE11 | ICO_ART33) from established facts. Draft only — it can never send or file; the SMF is the sole egress.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["SUP15", "PRINCIPLE11", "ICO_ART33"] },
        firm: { type: "string" },
        subject: { type: "string" },
        facts: { type: "string" },
        awareAt: { type: "string" },
        reference: { type: "string" },
      },
      required: ["kind", "firm", "subject", "facts"],
    },
  },
  write_register_entry: {
    description: "Create a PENDING draft register entry (never final).",
    input_schema: {
      type: "object",
      properties: {
        register: { type: "string" },
        arId: { type: "string" },
        data: { type: "object" },
        summary: { type: "string" },
      },
      required: ["register", "arId", "data", "summary"],
    },
  },
  enqueue_for_signoff: {
    description: "Route a PENDING draft to the human sign-off queue — the only egress.",
    input_schema: {
      type: "object",
      properties: { draftId: { type: "string" } },
      required: ["draftId"],
    },
  },
};

interface Block {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export function createAnthropicAgentModel(): AgentModel {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

  return {
    async run({ system, input, tools, callTool }) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new MissingApiKeyError();

      const toolDefs = tools
        .map((name) => {
          const s = TOOL_SCHEMAS[name];
          return s ? { name, description: s.description, input_schema: s.input_schema } : null;
        })
        .filter(Boolean);

      const messages: { role: string; content: unknown }[] = [
        { role: "user", content: JSON.stringify(input) },
      ];
      let tokens = 0;

      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const data = await call(apiKey, { model, system, tools: toolDefs, messages });
        tokens += (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
        const blocks: Block[] = data.content ?? [];

        if (data.stop_reason === "tool_use") {
          messages.push({ role: "assistant", content: blocks });
          const results = [];
          for (const b of blocks) {
            if (b.type !== "tool_use") continue;
            try {
              const out = await callTool(b.name!, b.input ?? {});
              results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out) });
            } catch (err) {
              // A denied/failed tool is reported back so the model can halt; it
              // can never succeed at a withheld tool (gateway rejects it).
              results.push({
                type: "tool_result",
                tool_use_id: b.id,
                is_error: true,
                content: (err as Error).message,
              });
            }
          }
          messages.push({ role: "user", content: results });
          continue;
        }

        // Terminal turn — the final text block should be the JSON output.
        const text = blocks.find((b) => b.type === "text")?.text ?? "";
        return { output: parseJson(text), tokens, model };
      }

      throw new ModelCallError(`agent exceeded ${MAX_TURNS} tool-use turns`);
    },
  };
}

interface MessagesResponse {
  content?: Block[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

async function call(
  apiKey: string,
  body: { model: string; system: string; tools: unknown[]; messages: unknown[] },
): Promise<MessagesResponse> {
  let resp: Response;
  try {
    resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({ max_tokens: 1500, ...body }),
    });
  } catch (err) {
    throw new ModelCallError(`Anthropic request failed: ${(err as Error).message}`);
  }
  if (!resp.ok) throw new ModelCallError(`Anthropic API ${resp.status}: ${await resp.text()}`);
  return (await resp.json()) as MessagesResponse;
}

/** Best-effort JSON parse; returns the raw string on failure so output validation flags it. */
function parseJson(text: string): unknown {
  try {
    // Tolerate ```json fences.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { verdict: "OPERATOR REVIEW", summary: "Model did not return valid JSON.", raw: text };
  }
}
