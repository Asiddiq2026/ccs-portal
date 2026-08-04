// Go-Live Monitoring — the operator dashboard over the same pure snapshot the
// /api/monitoring endpoint returns. Server component: loads the sign-off queue +
// agent_run log under withTenant, builds the snapshot, and renders the four
// signals (gates, queue age, open fail-closed, agent egress) plus the autonomy
// flag. Read-only; autonomy is a deploy-time control, never toggled here.
import { requireTenant } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { autonomousEnabled } from "@/lib/agents/autonomous";
import {
  buildSnapshot,
  type QueueItem,
  type AgentRunSummary,
  type AgentVerdict,
  type QueueBand,
} from "@/lib/monitoring/metrics";
import { ConsoleShell, AccessPanel } from "@/components/ConsoleShell";
import { prismaMeter } from "@/lib/metering/prisma-adapter";
import { parseMonthlyBudget } from "@/lib/metering/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verdictOf(output: unknown): AgentVerdict {
  const v = (output as { verdict?: unknown } | null)?.verdict;
  return v === "DRAFT READY" ? "DRAFT READY" : "OPERATOR REVIEW";
}

const BAND_BG: Record<QueueBand, string> = {
  green: "bg-status-success",
  amber: "bg-status-warn",
  red: "bg-status-danger",
};

function Stat({
  label,
  value,
  sub,
  tone = "text-text",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: string;
}) {
  return (
    <div className="border border-border bg-card shadow-card p-4">
      <p className="font-mono text-[9px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className={"font-heading font-bold text-2xl mt-1 " + tone}>{value}</p>
      <p className="text-xs text-text-secondary mt-1">{sub}</p>
    </div>
  );
}

export default async function MonitoringPage() {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return (
      <AccessPanel
        title="Sign in required"
        body="This console is restricted to CCS compliance operators. Sign in to continue."
      />
    );
  }
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    return (
      <AccessPanel
        title="Operators only"
        body="Go-Live Monitoring is visible to COMPLIANCE and SMF only."
      />
    );
  }

  const { queue, runs } = await withTenant(tenant, async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyTx = tx as any;
    const items = await anyTx.signOffItem.findMany({
      select: { id: true, createdAt: true, decidedAt: true },
    });
    const agentRuns = await anyTx.agentRun.findMany({
      select: { id: true, output: true, ts: true },
      orderBy: { ts: "desc" },
      take: 500,
    });
    return { queue: items, runs: agentRuns };
  });

  const queueItems: QueueItem[] = queue.map(
    (q: { id: string; createdAt: Date; decidedAt: Date | null }) => ({
      ref: q.id,
      enqueuedAt: q.createdAt,
      decidedAt: q.decidedAt,
    }),
  );
  const runSummaries: AgentRunSummary[] = runs.map(
    (r: { id: string; output: unknown; ts: Date }) => ({
      id: r.id,
      verdict: verdictOf(r.output),
      ts: r.ts,
    }),
  );

  // DECLARED, not verified: gates 1-4 are assumed cleared per the design and
  // gate 5 is a deploy-time flag. The platform holds no evidence for any of
  // them, so the UI labels this as declared rather than as a cleared fact.
  const gatesCleared = process.env.GATE5_CLEARED === "true" ? 5 : 4;
  const now = new Date();
  const snap = buildSnapshot({
    now,
    autonomous: autonomousEnabled(),
    gatesCleared,
    queue: queueItems,
    runs: runSummaries,
    usage: {
      monthTokens: await prismaMeter.monthToDate(now, tenant),
      budget: parseMonthlyBudget(),
    },
  });

  return (
    <ConsoleShell role={tenant.role} active="/monitoring">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h2 className="font-heading font-bold text-xl">Go-Live Monitoring</h2>
          <p className="text-sm text-text-secondary mt-1">
            Autonomy is gated, not assumed. Fail-closed alerts are reviewed, never auto-resolved.
          </p>
        </div>
        <span
          className={
            "font-mono text-xs px-2 py-1 border " +
            (snap.autonomous
              ? "border-status-live text-status-live"
              : "border-border text-text-muted")
          }
        >
          AGENTS_AUTONOMOUS={snap.autonomous ? "true" : "false"}
        </span>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {/* "Declared", not "cleared": gate clearance is a governance act recorded
            in writing outside this platform. Nothing here evidences it, so the
            tile must not read as a verified fact. */}
        <Stat
          label="Gates declared"
          value={`${snap.gates.cleared}/${snap.gates.total}`}
          sub={
            snap.gates.cleared >= 5
              ? "autonomy authorised · declared, not evidenced here"
              : "pilot quarter · declared, not evidenced here"
          }
          tone={snap.gates.cleared >= 5 ? "text-status-success" : "text-status-warn"}
        />
        {/* Model spend (COGS): month-to-date tokens vs the configured cap. An
            unmetered deployment is called out, not hidden. */}
        <Stat
          label="Model tokens · MTD"
          value={snap.usage.monthTokens.toLocaleString("en-GB")}
          sub={
            snap.usage.budget === null
              ? "no budget set — unmetered"
              : `cap ${snap.usage.budget.toLocaleString("en-GB")} · ${Math.max(0, snap.usage.budget - snap.usage.monthTokens).toLocaleString("en-GB")} left`
          }
          tone={
            snap.usage.budget === null
              ? "text-status-warn"
              : snap.usage.monthTokens >= snap.usage.budget * 0.8
                ? "text-status-danger"
                : "text-status-success"
          }
        />
        <Stat
          label="Median queue age"
          value={`${snap.queue.medianAgeHours}h`}
          sub={`target < ${snap.queue.targetHours}h · ${snap.queue.open} open`}
          tone="text-accent"
        />
        <Stat
          label="Open fail-closed"
          value={String(snap.failClosed.open)}
          sub="operator review pending"
          tone={snap.failClosed.open > 0 ? "text-status-danger" : "text-status-success"}
        />
        <Stat
          label="Agent egress"
          value={String(snap.agentEgress)}
          sub="sole egress is the sign-off queue"
          tone="text-status-success"
        />
      </section>

      <section className="border border-border bg-card shadow-card p-4 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-sm">Sign-off queue age</h3>
          {snap.queue.breaching > 0 && (
            <span className="font-mono text-[10px] text-status-danger">
              {snap.queue.breaching} breaching 48h
            </span>
          )}
        </div>
        {snap.queue.items.length === 0 ? (
          <p className="text-sm text-text-secondary">No open items.</p>
        ) : (
          <ul className="space-y-2">
            {snap.queue.items.map((q) => (
              <li key={q.ref} className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-text-muted w-40 truncate">{q.ref}</span>
                <div className="flex-1 h-2 bg-panel">
                  <div
                    className={"h-2 " + BAND_BG[q.band]}
                    style={{ width: `${Math.min(100, (q.ageHours / 72) * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-text-secondary w-10 text-right">
                  {q.ageHours}h
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-3 gap-4">
        <Stat label="Agent runs" value={String(snap.agentRuns.total)} sub="logged (last 500)" />
        <Stat
          label="Draft ready"
          value={String(snap.agentRuns.draftReady)}
          sub="drafts enqueued"
          tone="text-status-success"
        />
        <Stat
          label="Operator review"
          value={String(snap.agentRuns.operatorReview)}
          sub="fail-closed halts"
          tone={snap.agentRuns.operatorReview > 0 ? "text-status-warn" : "text-text"}
        />
      </section>

      <div className="mt-8 flex items-center justify-between">
        <p className="font-mono text-[9px] text-text-muted">
          generated {snap.generatedAt} · gate clearance is declared at deploy time
          (GATE5_CLEARED); the signed SMF16/17 record is held outside this platform
        </p>
        <a
          href="/api/audit/export"
          className="font-mono text-[10px] text-accent border border-accent px-2 py-1 hover:bg-accent hover:text-white"
        >
          Export audit trail (CSV)
        </a>
      </div>
    </ConsoleShell>
  );
}
