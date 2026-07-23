"use client";

// Operator-facing agent console. Lists the seven headless agents and lets an
// operator trigger a MANUAL run of each (the pilot quarter runs agents manual —
// see RUNBOOK §4 / GO_LIVE Phase E). It calls the existing gateway-enforced
// route POST /api/agents/:id/run; the run always fails closed to OPERATOR REVIEW
// rather than erroring, so a result is a normal, safe outcome — never egress.
import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AgentCard {
  id: string;
  version: string;
  trigger: string;
  schedule: string;
  description: string;
}

export interface RunRow {
  id: string;
  agentId: string;
  verdict: "DRAFT READY" | "OPERATOR REVIEW";
  ts: string;
  tokens: number;
}

interface RunResult {
  verdict?: "DRAFT READY" | "OPERATOR REVIEW";
  summary?: string;
  findings?: string[];
  enqueued?: { draftId: string; register: string }[];
  tokens?: number;
  error?: string;
}

function VerdictTag({ verdict }: { verdict: "DRAFT READY" | "OPERATOR REVIEW" }) {
  const draft = verdict === "DRAFT READY";
  return (
    <span
      className={
        "font-mono text-[10px] px-2 py-0.5 border " +
        (draft ? "border-status-success text-status-success" : "border-status-warn text-status-warn")
      }
    >
      {verdict}
    </span>
  );
}

function AgentRow({
  agent,
  autonomous,
  defaultArId,
}: {
  agent: AgentCard;
  autonomous: boolean;
  defaultArId: string;
}) {
  const router = useRouter();
  const [arId, setArId] = useState(defaultArId);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(arId.trim() ? { arId: arId.trim() } : {}),
      });
      const body = (await res.json()) as RunResult;
      if (!res.ok) {
        setResult({ error: body.error ?? `HTTP ${res.status}` });
      } else {
        setResult(body);
        // Refresh the server-rendered recent-runs list + monitoring counts.
        router.refresh();
      }
    } catch (err) {
      setResult({ error: (err as Error).message });
    } finally {
      setRunning(false);
    }
  }

  const autoLabel = autonomous && agent.trigger !== "ON_DEMAND";

  return (
    <div className="border border-border bg-card shadow-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-semibold text-sm truncate">{agent.id}</h3>
            <span className="font-mono text-[9px] text-text-muted">{agent.version}</span>
            <span className="font-mono text-[9px] px-1.5 py-0.5 border border-border text-text-secondary">
              {agent.trigger}
            </span>
            <span className="font-mono text-[9px] text-text-muted">
              {agent.schedule}
              {autoLabel ? " · auto" : ""}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-1">{agent.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            aria-label={`arId for ${agent.id}`}
            value={arId}
            onChange={(e) => setArId(e.target.value)}
            placeholder="arId (optional)"
            className="w-32 bg-panel border border-border px-2 py-1 text-xs font-mono focus:outline-none focus:border-accent"
          />
          <button
            onClick={run}
            disabled={running}
            className={
              "text-xs font-semibold px-3 py-1.5 border " +
              (running
                ? "border-border text-text-muted cursor-not-allowed"
                : "border-accent text-accent hover:bg-accent hover:text-white")
            }
          >
            {running ? "Running…" : "Run manually"}
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-3 border-t border-border pt-3">
          {result.error ? (
            <p className="text-xs text-status-danger font-mono">Error: {result.error}</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                {result.verdict && <VerdictTag verdict={result.verdict} />}
                <span className="text-xs text-text-secondary">{result.summary}</span>
                <span className="font-mono text-[9px] text-text-muted ml-auto">
                  {result.tokens ?? 0} tok
                </span>
              </div>
              {result.findings && result.findings.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {result.findings.map((f, i) => (
                    <li key={i} className="text-xs text-text-secondary font-mono flex gap-2">
                      <span className="text-text-muted">—</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
              {result.enqueued && result.enqueued.length > 0 && (
                <p className="text-xs text-status-success mt-2">
                  Enqueued for sign-off:{" "}
                  <span className="font-mono">
                    {result.enqueued.map((e) => `${e.register}:${e.draftId}`).join(", ")}
                  </span>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentsConsole({
  agents,
  recentRuns,
  autonomous,
  defaultArId,
}: {
  agents: AgentCard[];
  recentRuns: RunRow[];
  autonomous: boolean;
  defaultArId: string;
}) {
  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="font-heading font-bold text-xl">Agents</h2>
          <p className="text-sm text-text-secondary mt-1">
            Agents draft; humans decide. Every run routes drafts to the sign-off queue — the sole
            egress. Runs fail closed to OPERATOR REVIEW on any error or ambiguity.
          </p>
        </div>
        <span
          className={
            "font-mono text-xs px-2 py-1 border " +
            (autonomous
              ? "border-status-live text-status-live"
              : "border-border text-text-muted")
          }
        >
          AGENTS_AUTONOMOUS={autonomous ? "true" : "false"}
        </span>
      </div>

      <section className="space-y-3">
        {agents.map((a) => (
          <AgentRow key={a.id} agent={a} autonomous={autonomous} defaultArId={defaultArId} />
        ))}
      </section>

      <section className="border border-border bg-card shadow-card p-4">
        <h3 className="font-heading font-semibold text-sm mb-3">Recent runs</h3>
        {recentRuns.length === 0 ? (
          <p className="text-sm text-text-secondary">No agent runs logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {recentRuns.map((r) => (
              <li key={r.id} className="flex items-center gap-3 text-xs">
                <span className="font-mono text-[10px] text-text-secondary w-52 truncate">
                  {r.agentId}
                </span>
                <VerdictTag verdict={r.verdict} />
                <span className="font-mono text-[9px] text-text-muted">{r.tokens} tok</span>
                <span className="font-mono text-[9px] text-text-muted ml-auto">{r.ts}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
