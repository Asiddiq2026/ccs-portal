import { getAgentSpec } from "../agents/specs";
import { TOOL_REGISTRY, isWithheld, isReserved } from "./registry";
import { ToolDeniedError, ToolUnavailableError, type ToolContext } from "./types";

/**
 * The API gateway — the single choke point every tool call passes through
 * (Invariant 1). Enforcement order matters:
 *
 *   1. Withheld tool  -> 403 + TOOL DENIED audit row (Invariant 2). Checked
 *      first so a withheld tool is refused even if it somehow appeared on a
 *      whitelist. It is never dispatched.
 *   2. Whitelist      -> the tool must be on THIS agent's whitelist.
 *   3. Reserved       -> declared but unimplemented -> fail closed (501).
 *   4. Dispatch       -> Zod-validate input, run, Zod-validate output.
 *
 * The audit insert on denial is best-effort and never masks the denial itself.
 */
export async function invokeTool(
  ctx: ToolContext,
  toolName: string,
  rawInput: unknown,
): Promise<unknown> {
  // (1) Withheld — permanently forbidden.
  if (isWithheld(toolName)) {
    await auditDenied(ctx, toolName);
    throw new ToolDeniedError(toolName, "withheld tool — not on any whitelist");
  }

  // (2) Whitelist enforcement.
  const spec = getAgentSpec(ctx.agentId);
  if (!spec) {
    await auditDenied(ctx, toolName);
    throw new ToolDeniedError(toolName, `unknown agent: ${ctx.agentId}`);
  }
  if (!spec.tools.includes(toolName)) {
    await auditDenied(ctx, toolName);
    throw new ToolDeniedError(toolName, "not on agent whitelist");
  }

  // (3) Reserved-but-unimplemented — fail closed.
  if (isReserved(toolName)) {
    throw new ToolUnavailableError(toolName);
  }

  // (4) Dispatch to the implemented tool.
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) {
    await auditDenied(ctx, toolName);
    throw new ToolDeniedError(toolName, "no such tool");
  }

  const input = tool.input.parse(rawInput);
  const output = await tool.run(input, ctx);
  return tool.output.parse(output);
}

async function auditDenied(ctx: ToolContext, toolName: string): Promise<void> {
  try {
    await ctx.deps.audit.append(
      { actor: ctx.agentId, action: "TOOL DENIED", entity: "tool", entityId: toolName },
      ctx.tenant,
    );
  } catch {
    // Never let an audit failure swallow the denial.
  }
}
