// CCS-AGENT-SPECS-001 (Phase 7) — the Zod input/output contract every agent run
// is validated against, plus the versioned system-prompt renderer. Validation
// on BOTH sides is a hard requirement: a run whose input or output fails its
// schema fails closed to OPERATOR REVIEW (never a silent partial write).
import { z } from "zod";
import type { AgentSpec } from "./specs";

/** Validated envelope handed to an agent. `payload` carries trigger-specific data. */
export const AgentInputSchema = z.object({
  arId: z.string().optional(),
  trigger: z.enum(["MANUAL", "CRON", "WEBHOOK", "ON_DEMAND"]).default("MANUAL"),
  payload: z.record(z.unknown()).default({}),
});
export type AgentInput = z.infer<typeof AgentInputSchema>;

/**
 * The JSON an agent must return. Two terminal verdicts only:
 *   DRAFT READY     — output validated; drafts were enqueued for sign-off.
 *   OPERATOR REVIEW — the agent halted on error/ambiguity; NO draft produced.
 * `enqueued` lists sign-off draft ids the agent routed (its sole egress).
 */
export const AgentOutputSchema = z.object({
  verdict: z.enum(["DRAFT READY", "OPERATOR REVIEW"]),
  summary: z.string().min(1),
  findings: z.array(z.string()).default([]),
  enqueued: z
    .array(z.object({ draftId: z.string(), register: z.string() }))
    .default([]),
});
export type AgentOutput = z.infer<typeof AgentOutputSchema>;

export interface AgentIo {
  input: typeof AgentInputSchema;
  output: typeof AgentOutputSchema;
}

// One shared contract for all seven agents (the reference does not differentiate
// output shape per agent). Kept behind a lookup so a future agent can override.
export function getAgentIo(_agentId: string): AgentIo {
  return { input: AgentInputSchema, output: AgentOutputSchema };
}

/**
 * Render the versioned system prompt for an agent. The guardrails are constant
 * across agents (the golden rule + fail-closed + egress restriction); the spec
 * supplies the task. Kept deterministic so its hash is stable per (id, version).
 */
export function renderSystemPrompt(spec: AgentSpec): string {
  return `You are ${spec.id} (prompt ${spec.version}), a headless compliance agent for the CCS AR Oversight Platform operated for Razlin Limited (FRN 730805), an FCA-authorised principal firm.

Task: ${spec.description}

Non-negotiable rules:
- Agents draft; humans decide. You MUST NOT send, file, or finalise anything.
- Your only egress tool is enqueue_for_signoff. You have no other way to release work.
- You may call only these tools: ${spec.tools.join(", ")}.
- All dates and thresholds are computed by the deterministic engine tools — never estimate them yourself.
- On any error, ambiguity, or rule conflict, STOP and return verdict "OPERATOR REVIEW" with your findings. Do not guess. Producing no draft is the correct, safe outcome when you are unsure.
- When you have validated inputs and produced draft register entries, enqueue each for sign-off and return verdict "DRAFT READY".

Return only JSON matching the required output schema.`;
}
