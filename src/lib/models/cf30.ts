// Phase 6 wiring — CF30 Returns derive their due date + escalation ladder from
// the deterministic engine, never from an agent or a hand-typed value
// (Invariant 7). This is the single place that turns a calendar date into a
// persistable CF30 row, so every writer (API tool, agent, seed) stays consistent.
import { quarterEnd, cf30DueDate, escalationLadder, type EscalationStep } from "../engine";

const D = (s: string): Date => new Date(s + "T00:00:00Z");

/** "2026-Q1" from a quarter-end ISO date. */
function quarterLabel(quarterEndIso: string): string {
  const d = D(quarterEndIso);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

export interface Cf30Model {
  /** Prisma-ready row for `cf30_return` (status starts PENDING). */
  data: {
    arId: string;
    quarter: string;
    dueDate: Date;
    status: "PENDING";
    exceptions: number;
  };
  /** Computed context (not persisted here) for chase/escalation drafting. */
  quarterEnd: string;
  dueDate: string;
  ladder: EscalationStep[];
}

/**
 * Build a CF30 return row for the quarter containing `referenceDate`
 * (YYYY-MM-DD). due = quarter-end + 10 business days, via the engine.
 */
export function buildCf30Return(input: {
  arId: string;
  referenceDate: string;
  exceptions?: number;
}): Cf30Model {
  const qEnd = quarterEnd(input.referenceDate);
  const due = cf30DueDate(qEnd);
  return {
    data: {
      arId: input.arId,
      quarter: quarterLabel(qEnd),
      dueDate: D(due),
      status: "PENDING",
      exceptions: input.exceptions ?? 0,
    },
    quarterEnd: qEnd,
    dueDate: due,
    ladder: escalationLadder(due),
  };
}
