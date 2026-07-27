"use client";

// Data-breach channel UI (UK GDPR Art 33). The 72-hour clock shown here is
// computed server-side by the deterministic engine and handed down — this
// component never does the arithmetic itself. Logging is available to the AR
// (own firm) and to operators on behalf of a firm; only an SMF may report or
// close, which the server enforces regardless of what this UI renders.
import { useState } from "react";
import { useRouter } from "next/navigation";

export type BreachState = "OVERDUE" | "CRITICAL" | "DUE" | "ON_TRACK";
export type BreachStatus = "PENDING" | "REPORTED" | "CLOSED";

export interface BreachRow {
  id: string;
  arId: string;
  ref: string;
  detectedAt: string;
  art33Clock: string;
  status: BreachStatus;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  hoursRemaining: number;
  state: BreachState;
}

export interface BreachConsoleProps {
  role: "AR" | "COMPLIANCE" | "SMF";
  arId: string;
  breaches: BreachRow[];
}

const STATE_TONE: Record<BreachState, { text: string; bg: string; label: string }> = {
  OVERDUE: { text: "text-status-danger", bg: "bg-[rgba(185,28,28,0.09)]", label: "Overdue" },
  CRITICAL: { text: "text-status-danger", bg: "bg-[rgba(185,28,28,0.07)]", label: "< 12h" },
  DUE: { text: "text-status-warn", bg: "bg-[rgba(180,83,9,0.09)]", label: "< 24h" },
  ON_TRACK: { text: "text-status-success", bg: "bg-[rgba(21,128,61,0.08)]", label: "On track" },
};

const SEV_TONE: Record<string, string> = {
  LOW: "text-text-secondary",
  MEDIUM: "text-status-info",
  HIGH: "text-status-warn",
  CRITICAL: "text-status-danger",
};

function fmt(ts: string): string {
  return ts.slice(0, 16).replace("T", " ") + "Z";
}

/** Human countdown from server-computed hours. Never recomputed client-side. */
function countdown(hours: number): string {
  const abs = Math.abs(hours);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  const s = `${h}h ${String(m).padStart(2, "0")}m`;
  return hours < 0 ? `${s} overdue` : `${s} left`;
}

export function BreachConsole({ role, arId, breaches }: BreachConsoleProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  const open = breaches.filter((b) => b.status === "PENDING");
  const overdue = open.filter((b) => b.state === "OVERDUE").length;

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return false;
      }
      setShowLog(false);
      router.refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onLog(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const detected = String(f.get("detectedAt") ?? "").trim();
    await post("/api/breaches", {
      arId: role === "AR" ? arId : String(f.get("arId") ?? "").trim(),
      severity: String(f.get("severity") ?? "LOW"),
      // datetime-local has no zone; treat the operator's entry as UTC.
      detectedAt: detected ? new Date(detected + "Z").toISOString() : undefined,
    });
  }

  async function onDecide(id: string, decision: "REPORT" | "CLOSE") {
    let notes: string | undefined;
    if (decision === "CLOSE") {
      const entered = window.prompt(
        "Record the Art 33 assessment — why is no ICO notification due?",
      );
      if (!entered?.trim()) return;
      notes = entered.trim();
    }
    await post(`/api/breaches/${id}/decide`, { decision, notes });
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h2 className="font-heading font-bold text-xl">Data Breaches</h2>
          <p className="text-sm text-text-secondary mt-1">
            The Article 33 clock starts when the firm becomes aware — 72 hours, computed in code.
            Logging records the fact; only an SMF may notify the ICO or close without notifying.
          </p>
        </div>
        <button
          onClick={() => setShowLog((v) => !v)}
          className="font-mono text-[10px] uppercase tracking-[1.2px] px-3 py-2 border border-accent text-accent hover:bg-[rgba(8,145,178,0.07)] transition-colors"
        >
          {showLog ? "Cancel" : "Log a breach"}
        </button>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Stat label="Open" value={String(open.length)} sub="awaiting an SMF decision" tone="text-accent" />
        <Stat
          label="Overdue"
          value={String(overdue)}
          sub="past the 72h deadline"
          tone={overdue > 0 ? "text-status-danger" : "text-status-success"}
        />
        <Stat label="Logged" value={String(breaches.length)} sub="this firm · all time" tone="text-text" />
      </section>

      {error && (
        <div className="mb-4 border border-[rgba(185,28,28,0.35)] bg-[rgba(185,28,28,0.06)] px-4 py-3 text-sm text-status-danger">
          {error}
        </div>
      )}

      {showLog && (
        <form
          onSubmit={onLog}
          className="bg-card border border-border shadow-card p-5 mb-6 grid gap-4 md:grid-cols-3"
        >
          {role !== "AR" && (
            <label className="block">
              <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-text-muted">Firm (arId)</span>
              <input
                name="arId"
                required
                defaultValue=""
                placeholder="ar_codrington"
                className="mt-1 w-full border border-border bg-panel px-3 py-2 text-sm font-mono"
              />
            </label>
          )}
          <label className="block">
            <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-text-muted">
              Became aware (UTC) — blank = now
            </span>
            <input
              type="datetime-local"
              name="detectedAt"
              className="mt-1 w-full border border-border bg-panel px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-text-muted">Severity</span>
            <select
              name="severity"
              defaultValue="MEDIUM"
              className="mt-1 w-full border border-border bg-panel px-3 py-2 text-sm"
            >
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <div className="md:col-span-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="font-mono text-[10px] uppercase tracking-[1.2px] px-4 py-2 bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {busy ? "Logging…" : "Log breach — starts the 72h clock"}
            </button>
            <span className="text-xs text-text-muted">
              The deadline is derived from the awareness time; it cannot be edited afterwards.
            </span>
          </div>
        </form>
      )}

      <div className="bg-card border border-border shadow-card">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[1.4px] text-text-muted">
            Breach register
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[1.4px] text-text-muted">
            {breaches.length} record{breaches.length === 1 ? "" : "s"}
          </span>
        </div>

        {breaches.length === 0 ? (
          <p className="px-5 py-8 text-sm text-text-secondary">
            No breaches logged. That is the expected steady state — log one the moment the firm
            becomes aware, not once it is understood.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[9px] uppercase tracking-[1.2px] text-text-muted bg-panel">
                  <th className="px-5 py-2.5 font-normal">Ref</th>
                  <th className="px-3 py-2.5 font-normal">Firm</th>
                  <th className="px-3 py-2.5 font-normal">Aware</th>
                  <th className="px-3 py-2.5 font-normal">Art 33 deadline</th>
                  <th className="px-3 py-2.5 font-normal">Clock</th>
                  <th className="px-3 py-2.5 font-normal">Severity</th>
                  <th className="px-3 py-2.5 font-normal">Status</th>
                  {role === "SMF" && <th className="px-5 py-2.5 font-normal text-right">Decision</th>}
                </tr>
              </thead>
              <tbody>
                {breaches.map((b) => {
                  const tone = STATE_TONE[b.state];
                  return (
                    <tr key={b.id} className="border-t border-border align-middle">
                      <td className="px-5 py-3 font-mono text-[12px]">{b.ref}</td>
                      <td className="px-3 py-3 font-mono text-[11px] text-text-secondary">{b.arId}</td>
                      <td className="px-3 py-3 font-mono text-[11px] text-text-secondary tabular-nums">
                        {fmt(b.detectedAt)}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] tabular-nums">{fmt(b.art33Clock)}</td>
                      <td className="px-3 py-3">
                        {b.status === "PENDING" ? (
                          <span className={`font-mono text-[10px] px-2 py-1 ${tone.bg} ${tone.text}`}>
                            {countdown(b.hoursRemaining)}
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-text-muted">stopped</span>
                        )}
                      </td>
                      <td className={`px-3 py-3 font-mono text-[10px] ${SEV_TONE[b.severity]}`}>
                        {b.severity}
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px] text-text-secondary">{b.status}</td>
                      {role === "SMF" && (
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          {b.status === "PENDING" ? (
                            <>
                              <button
                                disabled={busy}
                                onClick={() => onDecide(b.id, "REPORT")}
                                className="font-mono text-[9px] uppercase tracking-[1px] px-2.5 py-1.5 border border-accent text-accent hover:bg-[rgba(8,145,178,0.07)] disabled:opacity-50 transition-colors"
                              >
                                Reported to ICO
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => onDecide(b.id, "CLOSE")}
                                className="ml-2 font-mono text-[9px] uppercase tracking-[1px] px-2.5 py-1.5 border border-border text-text-secondary hover:bg-panel disabled:opacity-50 transition-colors"
                              >
                                Close — none due
                              </button>
                            </>
                          ) : (
                            <span className="font-mono text-[9px] text-text-muted">settled</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-text-muted">
        The platform never files with the ICO itself. An agent may draft the Article 33 notification
        (DO-NOT-SEND) for sign-off; marking a breach reported records that an SMF has filed it.
      </p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="bg-card border border-border shadow-card p-4">
      <div className="font-mono text-[9px] uppercase tracking-[1.2px] text-text-muted">{label}</div>
      <div className={`font-heading font-bold text-2xl mt-1 tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-text-secondary mt-1">{sub}</div>
    </div>
  );
}
