// Agents — operator console for the seven headless agents. COMPLIANCE / SMF
// only. Server component: lists AGENT_SPECS and the recent agent_run log, then
// renders the client console whose Run buttons call the gateway-enforced route
// POST /api/agents/:id/run. During the pilot quarter agents are MANUAL (Phase E)
// and this is the operator's trigger surface; it is also where a fail-closed
// OPERATOR REVIEW is re-triggered after the underlying issue is fixed (RUNBOOK §4).
import { requireTenant } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { AGENT_SPECS } from "@/lib/agents/specs";
import { autonomousEnabled } from "@/lib/agents/autonomous";
import { ConsoleShell, AccessPanel } from "@/components/ConsoleShell";
import { AgentsConsole, type AgentCard, type RunRow } from "@/components/AgentsConsole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verdictOf(output: unknown): "DRAFT READY" | "OPERATOR REVIEW" {
  const v = (output as { verdict?: unknown } | null)?.verdict;
  return v === "DRAFT READY" ? "DRAFT READY" : "OPERATOR REVIEW";
}

export default async function AgentsPage() {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return (
      <AccessPanel
        title="Sign in required"
        body="The agents console is restricted to CCS compliance operators. Sign in to continue."
      />
    );
  }
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    return (
      <AccessPanel
        title="Operators only"
        body="Triggering agents is limited to COMPLIANCE and SMF operators."
      />
    );
  }

  const runs = await withTenant(tenant, async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyTx = tx as any;
    return anyTx.agentRun.findMany({
      select: { id: true, agentId: true, output: true, tokens: true, ts: true },
      orderBy: { ts: "desc" },
      take: 25,
    });
  });

  const recentRuns: RunRow[] = runs.map(
    (r: { id: string; agentId: string; output: unknown; tokens: number; ts: Date }) => ({
      id: r.id,
      agentId: r.agentId,
      verdict: verdictOf(r.output),
      tokens: r.tokens,
      ts: r.ts.toISOString().slice(0, 16).replace("T", " "),
    }),
  );

  const agents: AgentCard[] = AGENT_SPECS.map((a) => ({
    id: a.id,
    version: a.version,
    trigger: a.trigger,
    schedule: a.schedule,
    description: a.description,
    // runs are newest-first, so the first match is the latest run.
    lastRun: recentRuns.find((r) => r.agentId === a.id) ?? null,
  }));

  // Only COMPLIANCE/SMF reach here (guarded above), and operators are
  // network-wide, so leave the per-run arId input blank — they choose which AR
  // to run for.
  const defaultArId = "";

  return (
    <ConsoleShell role={tenant.role} active="/agents">
      <AgentsConsole
        agents={agents}
        recentRuns={recentRuns}
        autonomous={autonomousEnabled()}
        defaultArId={defaultArId}
      />
    </ConsoleShell>
  );
}
