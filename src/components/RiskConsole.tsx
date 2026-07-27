"use client";

// AR risk scoring (SUP 12 proportionate oversight). The assessor sets five
// factor scores; the band, total and monitoring cadence are computed by the
// engine server-side — this form deliberately has no band selector, because a
// band is derived evidence, not an opinion. Submitting proposes a PENDING
// sign-off draft; the register moves only on an SMF sign-off.
import { useState } from "react";
import { useRouter } from "next/navigation";

export interface RiskFactorDef {
  key: string;
  label: string;
}

export interface RiskCurrent {
  factors: number[];
  total: number;
  band: "GREEN" | "AMBER" | "RED";
  cadence: string;
  computedAt: string;
}

export interface RiskStandingRow {
  arId: string;
  legalName: string;
  current: RiskCurrent | null;
  monthsToReview: number;
  reviewDue: boolean;
  neverScored: boolean;
}

export interface RiskConsoleProps {
  rows: RiskStandingRow[];
  factors: RiskFactorDef[];
}

const BAND_TONE: Record<string, string> = {
  GREEN: "text-status-success bg-[rgba(21,128,61,0.09)]",
  AMBER: "text-status-warn bg-[rgba(180,83,9,0.10)]",
  RED: "text-status-danger bg-[rgba(185,28,28,0.09)]",
};

const SCORE_HINT = ["", "low", "moderate", "high"];

export function RiskConsole({ rows, factors }: RiskConsoleProps) {
  const router = useRouter();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [scores, setScores] = useState<number[]>(factors.map(() => 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Mirror of the engine's coded bands, for the live preview only — the server
  // recomputes authoritatively and its answer is what gets drafted.
  const total = scores.reduce((a, b) => a + b, 0);
  const previewBand = total <= 7 ? "GREEN" : total <= 11 ? "AMBER" : "RED";

  const due = rows.filter((r) => r.reviewDue).length;
  const red = rows.filter((r) => r.current?.band === "RED").length;

  function startAssessment(row: RiskStandingRow) {
    setOpenFor(row.arId);
    setScores(row.current?.factors?.length === factors.length ? [...row.current.factors] : factors.map(() => 1));
    setError(null);
    setNotice(null);
  }

  async function submit() {
    if (!openFor) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/risk/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ arId: openFor, factors: scores }),
      });
      const data = (await res.json()) as { error?: string; band?: string; total?: number };
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setNotice(
        `Proposed ${data.band} (${data.total}/15) for ${openFor}. It is in the sign-off queue awaiting an SMF.`,
      );
      setOpenFor(null);
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
        <h2 className="font-heading font-bold text-xl">AR Risk Scoring</h2>
        <p className="text-sm text-text-secondary mt-1">
          Five factors scored 1–3. The total, band and monitoring cadence are computed by the
          deterministic engine — there is no band to choose. Assessments are proposed for SMF
          sign-off, never written straight to the register.
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Stat label="Firms" value={String(rows.length)} sub="on the AR roster" tone="text-text" />
        <Stat
          label="Review due"
          value={String(due)}
          sub="never scored or past cadence"
          tone={due > 0 ? "text-status-warn" : "text-status-success"}
        />
        <Stat
          label="RED band"
          value={String(red)}
          sub="quarterly + ad-hoc"
          tone={red > 0 ? "text-status-danger" : "text-status-success"}
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

      <div className="bg-card border border-border shadow-card mb-6">
        <div className="px-5 py-3 border-b border-border">
          <span className="font-mono text-[9px] uppercase tracking-[1.4px] text-text-muted">
            Current position
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[9px] uppercase tracking-[1.2px] text-text-muted bg-panel">
                <th className="px-5 py-2.5 font-normal">Firm</th>
                <th className="px-3 py-2.5 font-normal">Band</th>
                <th className="px-3 py-2.5 font-normal">Total</th>
                <th className="px-3 py-2.5 font-normal">Cadence</th>
                <th className="px-3 py-2.5 font-normal">Next review</th>
                <th className="px-5 py-2.5 font-normal text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.arId} className="border-t border-border align-middle">
                  <td className="px-5 py-3">
                    <div>{r.legalName}</div>
                    <div className="font-mono text-[10px] text-text-muted">{r.arId}</div>
                  </td>
                  <td className="px-3 py-3">
                    {r.current ? (
                      <span className={`font-mono text-[10px] px-2 py-1 ${BAND_TONE[r.current.band]}`}>
                        {r.current.band}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-text-muted">not scored</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-[12px] tabular-nums">
                    {r.current ? `${r.current.total}/15` : "—"}
                  </td>
                  <td className="px-3 py-3 text-[12px] text-text-secondary">
                    {r.current?.cadence ?? "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] tabular-nums">
                    {r.reviewDue ? (
                      <span className="text-status-warn">{r.neverScored ? "never scored" : "due now"}</span>
                    ) : (
                      <span className="text-text-secondary">{r.monthsToReview}mo</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => startAssessment(r)}
                      className="font-mono text-[9px] uppercase tracking-[1px] px-2.5 py-1.5 border border-accent text-accent hover:bg-[rgba(8,145,178,0.07)] transition-colors"
                    >
                      {r.current ? "Re-assess" : "Assess"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openFor && (
        <div className="bg-card border border-border shadow-card p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="font-heading font-semibold">
              Assessment ·{" "}
              <span className="font-mono text-[12px] text-text-secondary">{openFor}</span>
            </h3>
            <button
              onClick={() => setOpenFor(null)}
              className="font-mono text-[9px] uppercase tracking-[1px] text-text-muted hover:text-text"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-3">
            {factors.map((f, i) => (
              <div key={f.key} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border pb-3 last:border-0">
                <div>
                  <div className="text-sm">{f.label}</div>
                  <div className="font-mono text-[10px] text-text-muted">{f.key}</div>
                </div>
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((v) => (
                    <button
                      key={v}
                      onClick={() => setScores((s) => s.map((x, j) => (j === i ? v : x)))}
                      aria-pressed={scores[i] === v}
                      className={
                        "font-mono text-[11px] w-16 py-1.5 border transition-colors " +
                        (scores[i] === v
                          ? "border-accent text-accent bg-[rgba(8,145,178,0.08)]"
                          : "border-border text-text-secondary hover:bg-panel")
                      }
                    >
                      {v} {SCORE_HINT[v]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
            <div className="text-sm">
              <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-text-muted mr-2">
                Engine result
              </span>
              <span className={`font-mono text-[11px] px-2 py-1 ${BAND_TONE[previewBand]}`}>
                {previewBand}
              </span>
              <span className="font-mono text-[12px] tabular-nums ml-2">{total}/15</span>
            </div>
            <button
              onClick={submit}
              disabled={busy}
              className="font-mono text-[10px] uppercase tracking-[1.2px] px-4 py-2 bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {busy ? "Proposing…" : "Propose for sign-off"}
            </button>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-text-muted">
        The band shown while scoring is a preview; the server recomputes it and the engine&apos;s
        result is what enters the sign-off queue.
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
