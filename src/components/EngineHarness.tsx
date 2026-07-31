"use client";

// Deterministic Engine harness — an operator-facing, read-only window onto the
// pure engine (src/lib/engine). It imports the SAME functions the agent runtime
// and register wiring use, so what an operator sees here is exactly what the
// platform computes (Invariant 7: all date/threshold arithmetic in code, zero
// LLM involvement). Nothing here writes; it only computes and displays.
import { useMemo, useState } from "react";
import {
  quarterEnd,
  cf30DueDate,
  escalationLadder,
  riskBand,
  cpdStrike,
  retentionEnd,
  art33Deadline,
  addBusinessDays,
  isBusinessDay,
  fmt,
} from "@/lib/engine";
import { BANK_HOLIDAYS } from "@/lib/engine/bank-holidays";
import { PRINCIPAL } from "@/lib/principal";

const Q_ENDS = ["2026-03-31", "2026-06-30", "2026-09-30", "2026-12-31"] as const;
const FACTOR_NAMES = [
  "Permissions & RAO scope",
  "Complaints history",
  "FP volume & complexity",
  "Training & competence",
  "Prior breaches",
] as const;
const CPD_PEOPLE = [
  { name: "A. Mensah · Drake Star", hours: 22, monthsLeft: 3 },
  { name: "J. Okafor · SIX", hours: 31, monthsLeft: 3 },
  { name: "R. Bailey · Codrington", hours: 29, monthsLeft: 1 },
  { name: "T. Whitmore · SIX", hours: 20, monthsLeft: 0 },
] as const;

// Known-good expectations, computed live against the engine — a regression
// harness that fails visibly if the arithmetic ever drifts.
interface Check {
  name: string;
  got: string;
  want: string;
}
function buildChecks(): Check[] {
  return [
    { name: "CF30 due = Q2-end + 10 business days", got: cf30DueDate("2026-06-30"), want: "2026-07-14" },
    { name: "quarterEnd maps mid-quarter to quarter close", got: quarterEnd("2026-05-15"), want: "2026-06-30" },
    { name: "addBusinessDays skips the weekend", got: addBusinessDays("2026-07-03", 1), want: "2026-07-06" },
    { name: "Christmas Day is not a business day", got: String(isBusinessDay("2026-12-25")), want: "false" },
    { name: "risk band · all-1s → GREEN", got: riskBand([1, 1, 1, 1, 1]).band, want: "GREEN" },
    { name: "risk band · all-2s → AMBER", got: riskBand([2, 2, 2, 2, 2]).band, want: "AMBER" },
    { name: "risk band · all-3s → RED", got: riskBand([3, 3, 3, 3, 3]).band, want: "RED" },
    { name: "CPD · 20h, 0 months left → strike 3", got: String(cpdStrike({ hours: 20, monthsLeft: 0 })), want: "3" },
    { name: "CPD · 35h, 6 months left → no strike", got: String(cpdStrike({ hours: 35, monthsLeft: 6 })), want: "0" },
    { name: "ICO Art 33 clock = awareness + 72h", got: art33Deadline("2026-07-20T09:00:00.000Z"), want: "2026-07-23T09:00:00.000Z" },
    { name: "audit retention = 6 years", got: retentionEnd("2026-07-20", "audit"), want: "2032-07-20" },
    { name: "agent_run retention = 7 years", got: retentionEnd("2026-07-20", "agent_run"), want: "2033-07-20" },
  ];
}

const PILL = "font-mono text-[10px] px-2 py-0.5 border whitespace-nowrap";
const TONE = {
  green: "text-status-success border-[rgba(21,128,61,0.3)] bg-[rgba(21,128,61,0.1)]",
  amber: "text-status-warn border-[rgba(180,83,9,0.28)] bg-[rgba(180,83,9,0.09)]",
  red: "text-status-danger border-[rgba(185,28,28,0.3)] bg-[rgba(185,28,28,0.09)]",
  accent: "text-accent border-[rgba(8,145,178,0.35)] bg-[rgba(8,145,178,0.1)]",
  muted: "text-text-secondary border-border bg-panel",
} as const;

function Stat({ label, value, sub, bar, subTone = "text-text-secondary" }: { label: string; value: string; sub: string; bar: string; subTone?: string }) {
  return (
    <div className="border border-border bg-card shadow-card p-4 relative overflow-hidden">
      <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: bar }} />
      <p className="font-mono text-[8px] uppercase tracking-[1.3px] text-text-muted mb-2">{label}</p>
      <p className="font-heading font-bold text-3xl leading-none">{value}</p>
      <p className={"text-[10.5px] mt-1 " + subTone}>{sub}</p>
    </div>
  );
}

export function EngineHarness() {
  const [qi, setQi] = useState(1); // default Q2 2026
  const [factors, setFactors] = useState<number[]>([2, 1, 3, 1, 2]);

  const checks = useMemo(buildChecks, []);
  const passed = checks.filter((c) => c.got === c.want).length;
  const allPass = passed === checks.length;

  const qEnd = Q_ENDS[qi];
  const due = cf30DueDate(qEnd);
  const ladder = escalationLadder(due);
  const band = riskBand(factors);
  const bandTone = band.band === "GREEN" ? TONE.green : band.band === "AMBER" ? TONE.amber : TONE.red;

  const setFactor = (i: number, v: number) => setFactors((f) => f.map((x, j) => (j === i ? v : x)));

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-heading font-semibold text-[27px] leading-none tracking-tight">Deterministic Engine</h2>
          <p className="font-mono text-[9.5px] tracking-wide text-text-muted mt-1.5">
            DATES · THRESHOLDS · ESCALATION · COMPUTED IN CODE — ZERO LLM INVOLVEMENT
          </p>
        </div>
        <span className={PILL + " " + (allPass ? TONE.green : TONE.red)}>
          {passed}/{checks.length} {allPass ? "GREEN" : "FAILING"}
        </span>
      </div>

      <div
        className="flex items-center gap-3 border border-border p-3.5 mb-5"
        style={{ borderLeft: "3px solid var(--ccs-accent)", background: "linear-gradient(100deg,rgba(8,145,178,.07),transparent)" }}
      >
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          <strong className="text-text">Agents never do arithmetic.</strong> Quarter-end + 10BD due dates, the
          T-5BD…T+20BD ladder, CPD three-strike thresholds, 5-factor risk banding, retention clocks and the ICO
          Art 33 72-hour clock are all pure, bank-holiday-aware functions in this module — the agent runtime
          calls them, it never computes.
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Checks passing" value={`${passed}/${checks.length}`} sub={allPass ? "harness green" : "DRIFT — investigate"} bar={allPass ? "#15803D" : "#B91C1C"} subTone={allPass ? "text-status-success" : "text-status-danger"} />
        <Stat label="Pure functions" value="9" sub="no I/O · no LLM" bar="#0891B2" />
        <Stat label="Bank holidays coded" value={String(BANK_HOLIDAYS.size)} sub="E&W · 2025–2030" bar="#1D4ED8" />
        <Stat label="Model arithmetic" value="0" sub="agents call, never compute" bar="#65A30D" subTone="text-status-success" />
      </section>

      <div className="grid lg:grid-cols-2 gap-4 mb-5">
        {/* CF30 cycle computer */}
        <div className="border border-border bg-card shadow-card">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="font-heading font-semibold text-[15px]">CF30 cycle computer</h3>
            <span className="font-mono text-[9px] text-text-muted">QUARTER-END + 10BD · E&amp;W HOLIDAYS</span>
          </div>
          <div className="p-5">
            <div className="flex gap-2 mb-4">
              {Q_ENDS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setQi(i)}
                  className={
                    "flex-1 py-1.5 font-mono text-[10.5px] border " +
                    (i === qi
                      ? "border-[rgba(8,145,178,0.4)] bg-[rgba(8,145,178,0.08)] text-accent font-medium"
                      : "border-border bg-card text-text-secondary hover:border-[rgba(8,145,178,0.4)]")
                  }
                >
                  Q{i + 1} 2026
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <div className="bg-panel border border-border p-3">
                <p className="font-mono text-[7.5px] uppercase tracking-wide text-text-muted mb-1">Quarter end</p>
                <p className="font-mono text-[13px]">{fmt(qEnd)}</p>
              </div>
              <div className="border border-[rgba(8,145,178,0.3)] bg-[rgba(8,145,178,0.06)] p-3">
                <p className="font-mono text-[7.5px] uppercase tracking-wide text-accent mb-1">Return due (T)</p>
                <p className="font-mono text-[13px] text-accent font-medium">{fmt(due)}</p>
              </div>
            </div>
            <div>
              {ladder.map((l, i) => (
                <div key={l.step} className="flex gap-3 items-start py-2 border-b border-[rgba(148,163,184,0.12)]">
                  <span
                    className={
                      PILL + " min-w-[58px] text-center " +
                      (i === 1 ? TONE.accent : i < 1 ? TONE.muted : TONE.amber)
                    }
                  >
                    {l.step}
                  </span>
                  <span className="font-mono text-[10.5px] min-w-[92px] pt-0.5">{fmt(l.date)}</span>
                  <span className="text-[11.5px] text-text-secondary leading-snug pt-px">{l.action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Risk + CPD column */}
        <div className="flex flex-col gap-4">
          <div className="border border-border bg-card shadow-card">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h3 className="font-heading font-semibold text-[15px]">Risk banding calculator</h3>
              <span className={PILL + " " + bandTone}>{band.band} · {band.total}</span>
            </div>
            <div className="px-5 py-3.5 flex flex-col gap-2.5">
              {FACTOR_NAMES.map((name, fi) => (
                <div key={name} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-text-secondary">{name}</span>
                  <div className="flex gap-1.5">
                    {[1, 2, 3].map((v) => (
                      <button
                        key={v}
                        onClick={() => setFactor(fi, v)}
                        className={
                          "w-[30px] h-[26px] font-mono text-[11px] border " +
                          (factors[fi] === v
                            ? "border-[rgba(8,145,178,0.4)] bg-[rgba(8,145,178,0.08)] text-accent font-medium"
                            : "border-border bg-card text-text-muted hover:border-[rgba(8,145,178,0.4)]")
                        }
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-2.5 mt-1">
                <span className="font-mono text-[9px] tracking-wide text-text-muted">TOTAL {band.total} / 15</span>
                <span className="text-[11.5px] text-text-secondary">{band.cadence}</span>
              </div>
            </div>
          </div>

          <div className="border border-border bg-card shadow-card">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h3 className="font-heading font-semibold text-[15px]">CPD three-strike check</h3>
              <span className="font-mono text-[9px] text-text-muted">35H/YR · CODED THRESHOLDS</span>
            </div>
            <div className="py-1.5">
              {CPD_PEOPLE.map((p) => {
                const s = cpdStrike({ hours: p.hours, monthsLeft: p.monthsLeft });
                const tone = s === 0 ? TONE.green : s === 1 ? TONE.amber : TONE.red;
                return (
                  <div key={p.name} className="flex items-center gap-3 px-5 py-2 border-b border-[rgba(148,163,184,0.1)]">
                    <span className="text-xs font-medium min-w-[130px]">{p.name}</span>
                    <span className="font-mono text-[10.5px] text-text-secondary min-w-[70px]">{p.hours} / 35h</span>
                    <span className="font-mono text-[10.5px] text-text-muted min-w-[88px]">{p.monthsLeft} mo left</span>
                    <span className={PILL + " ml-auto " + tone}>{s === 0 ? "ON TRACK" : `STRIKE ${s}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Regression harness */}
      <div className="border border-border bg-card shadow-card mb-6">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-3">
            <h3 className="font-heading font-semibold text-[15px]">Engine regression harness</h3>
            <span className={PILL + " " + (allPass ? TONE.green : TONE.red)}>{passed}/{checks.length} PASSING</span>
          </div>
          <span className="font-mono text-[9px] text-text-muted">bank-holiday edges · quarter boundaries · band limits · retention</span>
        </div>
        <div className="py-1.5">
          {checks.map((c) => {
            const ok = c.got === c.want;
            return (
              <div key={c.name} className="flex items-baseline gap-3 px-5 py-2 border-b border-[rgba(148,163,184,0.1)]">
                <span className={PILL + " min-w-[46px] text-center " + (ok ? TONE.green : TONE.red)}>
                  {ok ? "PASS" : "FAIL"}
                </span>
                <span className="text-xs min-w-[320px]">{c.name}</span>
                <span className="font-mono text-[10px] text-text-muted">
                  got {c.got} · want {c.want}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="font-mono text-[9px] text-text-muted tracking-wide pb-5">
        deterministic-engine (src/lib/engine) is the single source of date/threshold truth · CPD strike thresholds
        to be confirmed with {PRINCIPAL.shortName} at Gate 1
      </p>
    </div>
  );
}
