// CCS Deterministic Engine — all date/threshold arithmetic in code, never the
// model (Invariant 7). Ported verbatim in behaviour from
// design_references/deterministic-engine.js. Pure functions, no deps.
//
// Timezone: dates are calendar dates (UTC internally). Bank holidays:
// England & Wales (see bank-holidays.ts).
import { BANK_HOLIDAYS } from "./bank-holidays";

export type RiskBandName = "GREEN" | "AMBER" | "RED";
export type RetentionKind = "doc" | "audit" | "agent_run" | (string & {});

export interface RiskBandResult {
  total: number;
  band: RiskBandName;
  cadence: string;
}

export interface EscalationStep {
  step: string;
  date: string;
  action: string;
}

/** Parse a YYYY-MM-DD string as a UTC calendar date. */
const D = (s: string): Date => new Date(s + "T00:00:00Z");
/** Format a Date back to a YYYY-MM-DD string. */
const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** en-GB display format (e.g. "16 Apr 2026"), UTC. */
export function fmt(s: string): string {
  return D(s).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function isBusinessDay(dateStr: string): boolean {
  const wd = D(dateStr).getUTCDay();
  return wd !== 0 && wd !== 6 && !BANK_HOLIDAYS.has(dateStr);
}

export function addBusinessDays(dateStr: string, n: number): string {
  const d = D(dateStr);
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    if (isBusinessDay(iso(d))) left--;
  }
  return iso(d);
}

export function quarterEnd(dateStr: string): string {
  const d = D(dateStr);
  const q = Math.floor(d.getUTCMonth() / 3);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0)));
}

/** CF30 quarterly return: due = quarter-end + 10 business days. */
export function cf30DueDate(quarterEndStr: string): string {
  return addBusinessDays(quarterEndStr, 10);
}

/** Escalation ladder around the due date T. */
export function escalationLadder(dueDateStr: string): EscalationStep[] {
  return [
    { step: "T-5BD", date: addBusinessDays(dueDateStr, -5), action: "Reminder to AR · escalate to Razlin Compliance if unacknowledged" },
    { step: "T", date: dueDateStr, action: "Return due · submission window closes" },
    { step: "T+5BD", date: addBusinessDays(dueDateStr, 5), action: "Second chase · Compliance flag raised on the AR" },
    { step: "T+10BD", date: addBusinessDays(dueDateStr, 10), action: "Escalation to SMF16/17 · oversight meeting agenda item" },
    { step: "T+20BD", date: addBusinessDays(dueDateStr, 20), action: "Formal breach consideration · SUP 12 remediation review" },
  ];
}

/** 5-factor risk banding: each factor scored 1-3, total 5-15. */
export function riskBand(factors: number[]): RiskBandResult {
  const total = factors.reduce((a, b) => a + b, 0);
  if (total <= 7) return { total, band: "GREEN", cadence: "Bi-annual monitoring" };
  if (total <= 11) return { total, band: "AMBER", cadence: "Quarterly monitoring" };
  return { total, band: "RED", cadence: "Quarterly + ad-hoc monitoring" };
}

/**
 * How often a band must be re-assessed, in months (coded, per the monitoring
 * cadence riskBand assigns): GREEN bi-annual, AMBER/RED quarterly.
 */
export function riskReviewMonths(band: RiskBandName): number {
  return band === "GREEN" ? 6 : 3;
}

/** CPD 35h/yr, three-strike rule (coded thresholds — confirm with RAZ at Gate 1). */
export function cpdStrike(args: { hours: number; required?: number; monthsLeft: number }): number {
  const { hours, required = 35, monthsLeft } = args;
  if (monthsLeft <= 0 && hours < required) return 3;
  if (monthsLeft <= 1 && hours < required * 0.9) return 2;
  if (monthsLeft <= 3 && hours < required * 0.75) return 1;
  return 0;
}

/**
 * Whole months remaining until a date (floored, never negative). Feeds
 * cpdStrike's monthsLeft, so the strike ladder is driven by a coded clock
 * rather than a judgement call.
 */
export function monthsUntil(targetIso: string, nowIso: string): number {
  const target = new Date(targetIso);
  const now = new Date(nowIso);
  if (Number.isNaN(target.getTime()) || Number.isNaN(now.getTime())) return 0;
  let months =
    (target.getUTCFullYear() - now.getUTCFullYear()) * 12 +
    (target.getUTCMonth() - now.getUTCMonth());
  // Not a full month until the day-of-month is reached.
  if (target.getUTCDate() < now.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

// CPD-hour credit per training module (coded — confirm with RAZ at Gate 1).
// The eight quarterly modules sum to the 35h/yr requirement, so a person who
// passes the full programme is exactly compliant. Credited hours are derived
// here, NEVER taken from the training platform's own numbers (Invariant 7).
export const MODULE_CPD_HOURS: Record<string, number> = {
  m1: 4, m2: 4, m3: 5, m4: 5, m5: 4, m6: 5, m7: 4, m8: 4,
};

/**
 * Credited CPD hours from a set of training completions. Only PASSED modules
 * earn credit; each distinct module counts once (a retake does not double-count);
 * an unknown module earns zero. Deterministic — the single source of truth for
 * how completions become hours.
 */
export function creditedCpdHours(
  completions: ReadonlyArray<{ moduleId: string; passed: boolean }>,
): number {
  const counted = new Set<string>();
  let total = 0;
  for (const c of completions) {
    if (!c.passed || counted.has(c.moduleId)) continue;
    counted.add(c.moduleId);
    total += MODULE_CPD_HOURS[c.moduleId] ?? 0;
  }
  return total;
}

/** Retention clocks. Returns "indefinite" for AR / approved-person records. */
export function retentionEnd(dateStr: string, kind: RetentionKind): string {
  const years: number | undefined = { doc: 6, audit: 6, agent_run: 7 }[kind as string];
  if (years == null) return "indefinite";
  const d = D(dateStr);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return iso(d);
}

/** UK GDPR Art 33: ICO notification within 72 hours of awareness. */
export function art33Deadline(detectedIso: string): string {
  return new Date(new Date(detectedIso).getTime() + 72 * 3600 * 1000).toISOString();
}

export type Art33State = "OVERDUE" | "CRITICAL" | "DUE" | "ON_TRACK";

/**
 * Where an Art 33 clock stands right now. The banding is coded, not judged by a
 * model (Invariant 7): <0h OVERDUE, <12h CRITICAL, <24h DUE, else ON_TRACK.
 * `hoursRemaining` is negative once the deadline has passed.
 */
export function art33Remaining(
  deadlineIso: string,
  nowIso: string,
): { hoursRemaining: number; state: Art33State } {
  const ms = new Date(deadlineIso).getTime() - new Date(nowIso).getTime();
  const hoursRemaining = Math.round((ms / 3600000) * 10) / 10;
  const state: Art33State =
    hoursRemaining < 0
      ? "OVERDUE"
      : hoursRemaining < 12
        ? "CRITICAL"
        : hoursRemaining < 24
          ? "DUE"
          : "ON_TRACK";
  return { hoursRemaining, state };
}
