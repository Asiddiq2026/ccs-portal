"use client";

// AR roster (SUP 12). Each firm shows its appointment standing and the
// oversight load currently attached to it. Status changes are proposed, not
// applied — the buttons offered come from the server's coded transition state
// machine, so an unlawful move is never even presented.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRINCIPAL } from "@/lib/principal";

export type ArStatus = "ONBOARDING" | "ACTIVE" | "SUSPENDED" | "TERMINATED";

export interface ArRosterRow {
  arId: string;
  frn: string;
  legalName: string;
  status: ArStatus;
  onboardedAt: string;
  riskBand: "GREEN" | "AMBER" | "RED" | null;
  /** Readonly: it comes straight from the coded transition map and is only read. */
  allowedNext: readonly ArStatus[];
  openPromotions: number;
  openBreaches: number;
  pendingSignoffs: number;
}

export interface ArRosterConsoleProps {
  rows: ArRosterRow[];
  transitionNotes: Record<string, string>;
}

const STATUS_TONE: Record<ArStatus, string> = {
  ACTIVE: "text-status-success bg-[rgba(21,128,61,0.09)]",
  ONBOARDING: "text-status-info bg-[rgba(29,78,216,0.09)]",
  SUSPENDED: "text-status-warn bg-[rgba(180,83,9,0.10)]",
  TERMINATED: "text-text-muted bg-panel",
};

const BAND_TONE: Record<string, string> = {
  GREEN: "text-status-success",
  AMBER: "text-status-warn",
  RED: "text-status-danger",
};

export function ArRosterConsole({ rows, transitionNotes }: ArRosterConsoleProps) {
  const router = useRouter();
  const [target, setTarget] = useState<{ row: ArRosterRow; to: ArStatus } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = rows.filter((r) => r.status === "ACTIVE").length;
  const suspended = rows.filter((r) => r.status === "SUSPENDED").length;

  async function submit() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ars/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ arId: target.row.arId, status: target.to, reason }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setNotice(
        `Proposed ${target.row.legalName}: ${target.row.status} → ${target.to}. It is in the sign-off queue awaiting an SMF.`,
      );
      setTarget(null);
      setReason("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-heading font-bold text-xl">Appointed Representatives</h2>
        <p className="text-sm text-text-secondary mt-1">
          The SUP 12 register of firms {PRINCIPAL.shortName} is responsible for. Appointing, suspending and
          terminating carry FCA notification consequences, so a status change is proposed for SMF
          sign-off — never applied here.
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Stat label="On the roster" value={String(rows.length)} sub="appointed representatives" tone="text-text" />
        <Stat label="Active" value={String(active)} sub="may carry on business" tone="text-status-success" />
        <Stat
          label="Suspended"
          value={String(suspended)}
          sub="activity paused"
          tone={suspended > 0 ? "text-status-warn" : "text-text-secondary"}
        />
      </section>

      {error && (
        <div className="mb-4 border border-[rgba(185,28,28,0.35)] bg-[rgba(185,28,28,0.06)] px-4 py-3 text-sm text-status-danger">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 border border-[rgba(8,145,178,0.35)] bg-[rgba(8,145,178,0.07)] px-4 py-3 text-sm text-accent">
          {notice}
        </div>
      )}

      <div className="bg-card border border-border shadow-card">
        <div className="px-5 py-3 border-b border-border">
          <span className="font-mono text-[9px] uppercase tracking-[1.4px] text-text-muted">
            Roster · open oversight items
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[9px] uppercase tracking-[1.2px] text-text-muted bg-panel">
                <th className="px-5 py-2.5 font-normal">Firm</th>
                <th className="px-3 py-2.5 font-normal">FRN</th>
                <th className="px-3 py-2.5 font-normal">Status</th>
                <th className="px-3 py-2.5 font-normal">Risk</th>
                <th className="px-3 py-2.5 font-normal">Open FPs</th>
                <th className="px-3 py-2.5 font-normal">Open breaches</th>
                <th className="px-3 py-2.5 font-normal">In sign-off</th>
                <th className="px-5 py-2.5 font-normal text-right">Propose</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.arId} className="border-t border-border align-middle">
                  <td className="px-5 py-3">
                    <div>{r.legalName}</div>
                    <div className="font-mono text-[10px] text-text-muted">
                      {r.arId} · since {r.onboardedAt.slice(0, 10)}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] tabular-nums">{r.frn}</td>
                  <td className="px-3 py-3">
                    <span className={`font-mono text-[10px] px-2 py-1 ${STATUS_TONE[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className={`px-3 py-3 font-mono text-[10px] ${r.riskBand ? BAND_TONE[r.riskBand] : "text-text-muted"}`}>
                    {r.riskBand ?? "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-[12px] tabular-nums text-text-secondary">
                    {r.openPromotions}
                  </td>
                  <td
                    className={
                      "px-3 py-3 font-mono text-[12px] tabular-nums " +
                      (r.openBreaches > 0 ? "text-status-danger" : "text-text-secondary")
                    }
                  >
                    {r.openBreaches}
                  </td>
                  <td className="px-3 py-3 font-mono text-[12px] tabular-nums text-text-secondary">
                    {r.pendingSignoffs}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {r.allowedNext.length === 0 ? (
                      <span className="font-mono text-[9px] text-text-muted">terminal</span>
                    ) : (
                      r.allowedNext.map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            setTarget({ row: r, to: s });
                            setReason("");
                            setError(null);
                            setNotice(null);
                          }}
                          className={
                            "ml-2 font-mono text-[9px] uppercase tracking-[1px] px-2.5 py-1.5 border transition-colors " +
                            (s === "TERMINATED"
                              ? "border-[rgba(185,28,28,0.4)] text-status-danger hover:bg-[rgba(185,28,28,0.06)]"
                              : "border-accent text-accent hover:bg-[rgba(8,145,178,0.07)]")
                          }
                        >
                          {s}
                        </button>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {target && (
        <div className="bg-card border border-border shadow-card p-5 mt-6">
          <h3 className="font-heading font-semibold mb-1">
            {target.row.legalName}:{" "}
            <span className="font-mono text-[13px]">
              {target.row.status} → {target.to}
            </span>
          </h3>
          <p className="text-sm text-text-secondary mb-4">{transitionNotes[target.to]}</p>

          <label className="block">
            <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-text-muted">
              Reason — forms part of the regulated record
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Unremediated CF30 breaches following the Q2 oversight meeting."
              className="mt-1 w-full border border-border bg-panel px-3 py-2 text-sm"
            />
          </label>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={submit}
              disabled={busy || !reason.trim()}
              className="font-mono text-[10px] uppercase tracking-[1.2px] px-4 py-2 bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {busy ? "Proposing…" : "Propose for sign-off"}
            </button>
            <button
              onClick={() => setTarget(null)}
              className="font-mono text-[10px] uppercase tracking-[1.2px] px-3 py-2 border border-border text-text-secondary hover:bg-panel transition-colors"
            >
              Cancel
            </button>
            {!reason.trim() && (
              <span className="text-xs text-text-muted">A reason is required.</span>
            )}
          </div>
        </div>
      )}
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
