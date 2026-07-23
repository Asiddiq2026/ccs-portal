import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { autonomousEnabled } from "@/lib/agents/autonomous";
import {
  buildSnapshot,
  type QueueItem,
  type AgentRunSummary,
  type AgentVerdict,
} from "@/lib/monitoring/metrics";

export const runtime = "nodejs";

/**
 * GET /api/monitoring — the Go-Live Monitoring snapshot (operator-only).
 * Read-only aggregate over the sign-off queue + agent_run log. Gate 5 clearance
 * is a deploy-time control (GATE5_CLEARED), and autonomy reflects the
 * AGENTS_AUTONOMOUS flag — neither is toggleable from this endpoint.
 */
export async function GET(): Promise<Response> {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    return NextResponse.json({ error: "operators only" }, { status: 403 });
  }

  try {
    const { queue, runs } = await withTenant(tenant, async (tx) => {
      const items = await tx.signOffItem.findMany({
        select: { id: true, createdAt: true, decidedAt: true },
      });
      const agentRuns = await tx.agentRun.findMany({
        select: { id: true, output: true, ts: true },
        orderBy: { ts: "desc" },
        take: 500,
      });
      return { queue: items, runs: agentRuns };
    });

    const queueItems: QueueItem[] = queue.map((q) => ({
      ref: q.id,
      enqueuedAt: q.createdAt,
      decidedAt: q.decidedAt,
    }));
    const runSummaries: AgentRunSummary[] = runs.map((r) => ({
      id: r.id,
      verdict: verdictOf(r.output),
      ts: r.ts,
    }));

    // Gate 5 clears 5/5; otherwise 4 (Gates 1–4 are cleared in the design).
    const gatesCleared = process.env.GATE5_CLEARED === "true" ? 5 : 4;

    const snapshot = buildSnapshot({
      now: new Date(),
      autonomous: autonomousEnabled(),
      gatesCleared,
      queue: queueItems,
      runs: runSummaries,
    });
    return NextResponse.json(snapshot, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** Pull the terminal verdict out of the stored AgentRun output JSON (fail-safe). */
function verdictOf(output: unknown): AgentVerdict {
  const v = (output as { verdict?: unknown } | null)?.verdict;
  return v === "DRAFT READY" ? "DRAFT READY" : "OPERATOR REVIEW";
}
