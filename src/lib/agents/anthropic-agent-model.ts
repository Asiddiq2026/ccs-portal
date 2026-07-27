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
  screen_feeds: {
    description:
      "Adverse-media / sanctions screening for named subjects. Returns CLEAR, FLAGGED, or OPERATOR_REVIEW (fail-closed when no provider is configured). Writes nothing.",
    input_schema: {
      type: "object",
      properties: {
        subjects: { type: "array", items: { type: "string" } },
        arId: { type: "string" },
      },
      required: ["subjects"],
    },
  },
  compile_pack: {
    description:
      "Compile an oversight-meeting prep pack from sections you have already established via query_database. Files it as a PENDING sign-off artifact — never a final record.",
    input_schema: {
      type: "object",
      properties: {
        arId: { type: "string" },
        meetingDate: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              lines: { type: "array", items: { type: "string" } },
            },
            required: ["heading"],
          },
        },
      },
      required: ["arId", "sections"],
    },
  },
  gather_docs: {
    description:
      "Assemble references to already-stored WORM documents into a PENDING evidence pack. References existing sha256 manifests only — it never uploads or creates documents.",
    input_schema: {
      type: "object",
      properties: {
        arId: { type: "string" },
        purpose: { type: "string" },
        docs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              sha256: { type: "string" },
              blobUrl: { type: "string" },
              size: { type: "number" },
            },
            required: ["name", "sha256"],
          },
        },
      },
      required: ["arId", "purpose", "docs"],
    },
  },
};

/**
 * The RETURN CHANNEL, not a capability. The model finishes a run by calling this
 * pseudo-tool, whose input_schema mirrors AgentOutputSchema exactly — so the API
 * validates the shape for us instead of us hoping for clean JSON in prose.
 *
 * It is intercepted here and NEVER passed to `callTool`, so it never reaches the
 * gateway, has no registry entry, and performs no side effect of any kind. It
 * grants the model nothing: the sole egress remains enqueue_for_signoff.
 */
const SUBMIT_TOOL = "submit_report";

const SUBMIT_SCHEMA = {
  name: SUBMIT_TOOL,
  description:
    "Submit your final result and end the run. Call this exactly once, as your last action. This does not send, file, or publish anything — it only returns your report to the platform.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["DRAFT READY", "OPERATOR REVIEW"],
        description:
          "DRAFT READY only if you enqueued at least one draft for sign-off; otherwise OPERATOR REVIEW.",
      },
      summary: { type: "string", description: "One or two sentences. Required, non-empty." },
      findings: { type: "array", items: { type: "string" } },
      enqueued: {
        type: "array",
        items: {
          type: "object",
          properties: { draftId: { type: "string" }, register: { type: "string" } },
          required: ["draftId", "register"],
        },
      },
    },
    required: ["verdict", "summary"],
  },
} as const;

// Transport-specific output contract. Kept OUT of renderSystemPrompt so the
// audited promptHash still identifies the agent's versioned instructions only;
// this envelope describes how to return a result over the Messages API.
const OUTPUT_PROTOCOL = `
HOW TO FINISH (transport contract):
- End the run by calling the ${SUBMIT_TOOL} tool exactly once. Do not answer in prose.
- ${SUBMIT_TOOL} is a return channel, not an action: it sends, files and publishes nothing.
- verdict must be exactly "DRAFT READY" or "OPERATOR REVIEW".
- Use "DRAFT READY" only if you actually enqueued at least one draft via enqueue_for_signoff, and list each in enqueued as {draftId, register}.
- If you did not enqueue anything — including when you are unsure, blocked, or a tool failed — use "OPERATOR REVIEW" and explain why in summary and findings.
- summary is required and must be non-empty.`;

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

      // Always offer the return channel alongside the agent's whitelisted tools.
      const offered = [...toolDefs, SUBMIT_SCHEMA];

      const messages: { role: string; content: unknown }[] = [
        { role: "user", content: JSON.stringify(input) },
      ];
      let tokens = 0;
      let repaired = false;

      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const data = await call(apiKey, {
          model,
          system: system + OUTPUT_PROTOCOL,
          tools: offered,
          messages,
        });
        tokens += (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
        const blocks: Block[] = data.content ?? [];

        // The model finished by calling the return channel — the API already
        // shape-checked it, so this is the reliable path.
        const submit = blocks.find((b) => b.type === "tool_use" && b.name === SUBMIT_TOOL);
        if (submit) return { output: submit.input ?? {}, tokens, model };

        if (data.stop_reason === "tool_use") {
          messages.push({ role: "assistant", content: blocks });
          const results = [];
          for (const b of blocks) {
            if (b.type !== "tool_use") continue;
            try {
              // submit_report is handled above and never dispatched; every other
              // name goes through the gateway.
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

        // Fallback: the model answered in text. Accept well-formed JSON found
        // anywhere in it (fenced or with prose around it).
        const text = blocks.map((b) => (b.type === "text" ? b.text ?? "" : "")).join("\n");
        const extracted = extractJson(text);
        if (extracted !== undefined) return { output: extracted, tokens, model };

        // One corrective turn before giving up — a truncated or prose-only reply
        // is recoverable, and the alternative is discarding real work.
        if (!repaired) {
          repaired = true;
          const why =
            data.stop_reason === "max_tokens"
              ? "Your previous reply was cut off before it was complete."
              : "Your previous reply was not a tool call and contained no valid JSON object.";
          messages.push({ role: "assistant", content: blocks.length ? blocks : "(no content)" });
          messages.push({
            role: "user",
            content: `${why} Do not repeat your analysis. Call the ${SUBMIT_TOOL} tool now with your final result, and nothing else.`,
          });
          continue;
        }

        // Fail closed with the reason preserved for the operator.
        return {
          output: {
            verdict: "OPERATOR REVIEW",
            summary: `Model did not return a usable result (stop_reason: ${data.stop_reason ?? "unknown"}).`,
            findings: text ? [text.slice(0, 500)] : [],
            enqueued: [],
          },
          tokens,
          model,
        };
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
      // 1500 was low enough that a reasoning-heavy turn could be cut off
      // mid-JSON (stop_reason "max_tokens"), which then read as a malformed
      // result. The loop also handles truncation explicitly.
      body: JSON.stringify({ max_tokens: 4096, ...body }),
    });
  } catch (err) {
    throw new ModelCallError(`Anthropic request failed: ${(err as Error).message}`);
  }
  if (!resp.ok) throw new ModelCallError(`Anthropic API ${resp.status}: ${await resp.text()}`);
  return (await resp.json()) as MessagesResponse;
}

/**
 * Pull the first well-formed JSON object out of a text reply. The model may wrap
 * it in ```json fences or surround it with prose, so anchored trimming is not
 * enough — we scan for a balanced object, ignoring braces inside strings.
 * Returns undefined when there is nothing parseable, so the caller can repair
 * or fail closed rather than fabricate a result.
 */
export function extractJson(text: string): unknown | undefined {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (inString) {
        if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(i, j + 1));
          } catch {
            break; // Not valid from this "{" — try the next one.
          }
        }
      }
    }
  }
  return undefined;
}
