import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { prismaToolDeps } from "@/lib/tools/prisma-adapters";
import { prismaAgentRunLog } from "@/lib/agents/prisma-run-log";
import { createAnthropicAgentModel } from "@/lib/agents/anthropic-agent-model";
import { runAgent, AgentError } from "@/lib/agents/runner";
import { prismaMeter } from "@/lib/metering/prisma-adapter";
import { parseMonthlyBudget } from "@/lib/metering/service";

export const runtime = "nodejs";

/**
 * POST /api/agents/:id/run — operator-triggered manual agent run (Phase 7 ships
 * MANUAL-TRIGGER first; autonomous scheduling is gated by AGENTS_AUTONOMOUS in
 * Phase 8). Only COMPLIANCE / SMF operators may trigger. The run fails closed to
 * an OPERATOR REVIEW result rather than erroring, so a 200 with
 * `operatorReview: true` is a normal, safe outcome.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    return NextResponse.json({ error: "only operators may trigger agents" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    const result = await runAgent({
      agentId: params.id,
      tenant,
      input: { ...body, trigger: "MANUAL" },
      deps: prismaToolDeps,
      model: createAnthropicAgentModel(),
      runLog: prismaAgentRunLog,
      meter: prismaMeter,
      modelBudget: parseMonthlyBudget(),
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const status = err instanceof AgentError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
