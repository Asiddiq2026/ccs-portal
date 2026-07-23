import { z } from "zod";
import { invokeTool } from "@/lib/tools/gateway";
import {
  ToolDeniedError,
  ToolUnavailableError,
  type Tenant,
  type ToolDeps,
} from "@/lib/tools/types";

// Request shape for the single tool-invocation endpoint. `agentId` names the
// whitelist that governs the call (the gateway rejects anything off it);
// `tenant` is NOT in the body — it is derived server-side from the session so a
// caller can never assert a firm it isn't scoped to.
const BodySchema = z.object({
  agentId: z.string().min(1),
  tool: z.string().min(1),
  input: z.unknown().optional(),
});

export interface InvokeResult {
  status: number;
  body: unknown;
}

/**
 * Pure request handler for POST /api/tools/invoke — the HTTP face of the single
 * writeable path (Invariant 1). Kept free of `next/server`, Auth.js and Prisma
 * so it is unit-testable with in-memory deps; the route module injects the real
 * tenant + Prisma-backed deps.
 *
 * Error mapping mirrors the gateway's own status codes and never leaks internals:
 *   400  malformed body / invalid tool input (Zod)
 *   403  ToolDeniedError  (withheld, off-whitelist, unknown agent, unknown draft)
 *   501  ToolUnavailableError (reserved-but-unimplemented — fail closed)
 *   500  anything unexpected
 */
export async function handleInvoke(
  tenant: Tenant,
  deps: ToolDeps,
  rawBody: unknown,
): Promise<InvokeResult> {
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "invalid request body", detail: parsed.error.flatten() },
    };
  }

  const { agentId, tool, input } = parsed.data;
  try {
    const result = await invokeTool({ agentId, tenant, deps }, tool, input ?? {});
    return { status: 200, body: { ok: true, result } };
  } catch (err) {
    if (err instanceof ToolDeniedError) {
      return { status: err.status, body: { error: err.message } };
    }
    if (err instanceof ToolUnavailableError) {
      return { status: err.status, body: { error: err.message } };
    }
    if (err instanceof z.ZodError) {
      return {
        status: 400,
        body: { error: "invalid tool input", detail: err.flatten() },
      };
    }
    // Unexpected — surface nothing internal to the caller.
    return { status: 500, body: { error: "internal error" } };
  }
}
