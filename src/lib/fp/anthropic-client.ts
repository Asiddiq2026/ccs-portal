// Server-only Anthropic adapter for the FP AI review. Uses ANTHROPIC_API_KEY
// from the environment and never ships to the client bundle (the reference
// called the API from the browser — this moves it server-side, Phase 5). Plain
// fetch to the Messages API so no SDK dependency is added.
import type { ModelClient } from "./ai-review";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export class MissingApiKeyError extends Error {
  readonly status = 503 as const;
  constructor() {
    super("ANTHROPIC_API_KEY is not configured");
    this.name = "MissingApiKeyError";
  }
}

export class ModelCallError extends Error {
  readonly status = 502 as const;
  constructor(message: string) {
    super(message);
    this.name = "ModelCallError";
  }
}

/**
 * Build a ModelClient bound to the Anthropic Messages API. Model id is
 * env-overridable (`ANTHROPIC_MODEL`) so it can be pinned per environment
 * without a code change. Throws MissingApiKeyError at call time if no key.
 */
export function createAnthropicClient(): ModelClient {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
  return {
    async complete(prompt: string) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new MissingApiKeyError();

      let resp: Response;
      try {
        resp = await fetch(API_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            max_tokens: 1000,
            messages: [{ role: "user", content: prompt }],
          }),
        });
      } catch (err) {
        throw new ModelCallError(`Anthropic request failed: ${(err as Error).message}`);
      }

      if (!resp.ok) {
        throw new ModelCallError(`Anthropic API ${resp.status}: ${await resp.text()}`);
      }

      const data = (await resp.json()) as {
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = data.content?.find((b) => b.type === "text")?.text;
      if (!text) throw new ModelCallError("Anthropic response contained no text block");
      // Token usage feeds the model_usage ledger (metering).
      const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
      return { text, tokens };
    },
  };
}
