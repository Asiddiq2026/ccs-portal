// Phase 7 — the shared, fail-closed agent runner. Every agent run flows through
// here so the invariants hold uniformly:
//   validate input → render versioned prompt → let the model act using ONLY
//   whitelisted tools (routed through the gateway) → validate output → write an
//   immutable AgentRun log → on ANY error/ambiguity, halt and raise OPERATOR
//   REVIEW (no draft, no egress).
// The model + run-log + tool deps are injected so this is testable with no
// network and no database.
import { createHash } from "node:crypto";
import { invokeTool } from "../tools/gateway";
import type { ToolDeps, Tenant } from "../tools/types";
import { getAgentSpec, type AgentSpec } from "./specs";
import { getAgentIo, renderSystemPrompt, type AgentOutput } from "./io";
import { checkBudget, type MeterStore } from "../metering/service";

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Thrown for caller errors (unknown agent, forbidden role) — mapped by the route. */
export class AgentError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

/**
 * The model side of one agent invocation. Implementations run the tool-use loop:
 * they may call `callTool` (which is gateway-enforced — withheld/off-whitelist
 * tools reject) any number of times, then return the final JSON output.
 */
export interface AgentModel {
  run(params: {
    system: string;
    input: unknown;
    tools: readonly string[];
    callTool: (name: string, args: unknown) => Promise<unknown>;
  }): Promise<{ output: unknown; tokens: number; model: string }>;
}

export interface AgentRunWriter {
  append(
    run: {
      agentId: string;
      version: string;
      promptHash: string;
      inputHash: string;
      tokens: number;
      output: unknown;
    },
    tenant: Tenant,
  ): Promise<{ id: string }>;
}

export interface RunAgentArgs {
  agentId: string;
  tenant: Tenant;
  input: unknown;
  deps: ToolDeps;
  model: AgentModel;
  runLog: AgentRunWriter;
  /** Optional metering: enforce the monthly token budget + record usage. */
  meter?: MeterStore;
  modelBudget?: number | null;
}

export interface AgentRunResult {
  runId: string;
  agentId: string;
  version: string;
  verdict: AgentOutput["verdict"];
  summary: string;
  findings: string[];
  enqueued: AgentOutput["enqueued"];
  tokens: number;
  operatorReview: boolean;
}

/**
 * Execute one agent run. Never throws for operational failures — it fails closed
 * to an OPERATOR REVIEW result so the caller can return 200 with the flag. Only
 * caller errors (unknown agent) throw AgentError.
 */
export async function runAgent(args: RunAgentArgs): Promise<AgentRunResult> {
  const spec = getAgentSpec(args.agentId);
  if (!spec) throw new AgentError(404, `unknown agent: ${args.agentId}`);

  const io = getAgentIo(spec.id);
  const system = renderSystemPrompt(spec);
  const promptHash = sha256(system);

  // Input validation — a malformed trigger is itself an operator-review event.
  const parsedInput = io.input.safeParse(args.input);
  const inputHash = sha256(JSON.stringify(args.input ?? null));
  if (!parsedInput.success) {
    return finalize(args, spec, {
      promptHash,
      inputHash,
      tokens: 0,
      operatorReview: true,
      output: {
        verdict: "OPERATOR REVIEW",
        summary: "Input failed schema validation — halted before acting.",
        findings: parsedInput.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        enqueued: [],
      },
    });
  }

  // Every tool call is gateway-enforced. Withheld / off-whitelist / reserved
  // tools reject here, so they are unreachable to the model (Invariant 2).
  const callTool = (name: string, toolArgs: unknown) =>
    invokeTool({ agentId: spec.id, tenant: args.tenant, deps: args.deps }, name, toolArgs);

  // Monthly token-budget gate — refused BEFORE any model call, so an exhausted
  // budget costs nothing. Fail-closed to OPERATOR REVIEW like every other halt.
  if (args.meter && args.modelBudget != null) {
    const decision = checkBudget(
      await args.meter.monthToDate(new Date(), args.tenant),
      args.modelBudget,
    );
    if (!decision.allowed) {
      return finalize(args, spec, {
        promptHash,
        inputHash,
        tokens: 0,
        operatorReview: true,
        output: {
          verdict: "OPERATOR REVIEW",
          summary: `Monthly model-token budget exhausted (${decision.spent} of ${decision.budget} used) — run refused before any model call.`,
          findings: ["Raise MODEL_TOKEN_BUDGET_MONTHLY or wait for the new month."],
          enqueued: [],
        },
      });
    }
  }

  try {
    const { output, tokens } = await args.model.run({
      system,
      input: parsedInput.data,
      tools: spec.tools,
      callTool,
    });

    // Record spend in the usage ledger regardless of whether the output
    // validates — the tokens are consumed either way. Never mask the run result
    // with a metering failure.
    if (args.meter && tokens > 0) {
      try {
        await args.meter.record(
          { source: "agent_run", tokens, arId: parsedInput.data.arId ?? null },
          args.tenant,
        );
      } catch {
        // Ledger write failure is an ops problem, not a run failure.
      }
    }

    const parsedOutput = io.output.safeParse(output);
    if (!parsedOutput.success) {
      return finalize(args, spec, {
        promptHash,
        inputHash,
        tokens,
        operatorReview: true,
        output: {
          verdict: "OPERATOR REVIEW",
          summary: "Model output failed schema validation — no draft accepted.",
          findings: parsedOutput.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
          enqueued: [],
        },
      });
    }

    const isReview = parsedOutput.data.verdict === "OPERATOR REVIEW";
    return finalize(args, spec, {
      promptHash,
      inputHash,
      tokens,
      operatorReview: isReview,
      output: parsedOutput.data,
    });
  } catch (err) {
    // Any thrown error (incl. a denied tool call) → fail closed.
    return finalize(args, spec, {
      promptHash,
      inputHash,
      tokens: 0,
      operatorReview: true,
      output: {
        verdict: "OPERATOR REVIEW",
        summary: "Agent halted on an error — fail-closed, no draft produced.",
        findings: [(err as Error).message],
        enqueued: [],
      },
    });
  }
}

/** Write the immutable AgentRun log + the audit event, and shape the result. */
async function finalize(
  args: RunAgentArgs,
  spec: AgentSpec,
  r: {
    promptHash: string;
    inputHash: string;
    tokens: number;
    operatorReview: boolean;
    output: AgentOutput;
  },
): Promise<AgentRunResult> {
  const { id: runId } = await args.runLog.append(
    {
      agentId: spec.id,
      version: spec.version,
      promptHash: r.promptHash,
      inputHash: r.inputHash,
      tokens: r.tokens,
      output: r.output,
    },
    args.tenant,
  );

  // Audit trail: AGENT RUN on success, OPERATOR REVIEW when fail-closed.
  try {
    await args.deps.audit.append(
      {
        actor: spec.id,
        action: r.operatorReview ? "OPERATOR REVIEW" : "AGENT RUN",
        entity: "agent_run",
        entityId: runId,
      },
      args.tenant,
    );
  } catch {
    // Audit failure must not mask the run result.
  }

  return {
    runId,
    agentId: spec.id,
    version: spec.version,
    verdict: r.output.verdict,
    summary: r.output.summary,
    findings: r.output.findings,
    enqueued: r.output.enqueued,
    tokens: r.tokens,
    operatorReview: r.operatorReview,
  };
}
