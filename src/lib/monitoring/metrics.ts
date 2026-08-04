// Phase 8 — Go-Live Monitoring metrics. Pure functions over already-loaded rows
// so the whole snapshot is unit-testable with no database. The dashboard tracks
// the four signals from the Go-Live Monitoring reference: sign-off queue age
// (target < 48h), open fail-closed OPERATOR REVIEW count, gates cleared, and
// agent egress (which is structurally 0 — the sole egress is the sign-off
// queue, Invariant 3).

/** A PENDING sign-off item awaiting a human decision. */
export interface QueueItem {
  ref: string;
  enqueuedAt: Date;
  /** Set once an SMF decides; open items are those still null/undefined. */
  decidedAt?: Date | null;
}

/** The terminal verdict recorded on an AgentRun's output. */
export type AgentVerdict = "DRAFT READY" | "OPERATOR REVIEW";

export interface AgentRunSummary {
  id: string;
  verdict: AgentVerdict;
  ts: Date;
}

export type QueueBand = "green" | "amber" | "red";

export interface QueueAgeRow {
  ref: string;
  ageHours: number;
  band: QueueBand;
}

export const QUEUE_TARGET_HOURS = 48;
export const GATES_TOTAL = 5;

/** Whole hours between enqueue and now (floored, never negative). */
export function ageHours(enqueuedAt: Date, now: Date): number {
  const ms = now.getTime() - enqueuedAt.getTime();
  return Math.max(0, Math.floor(ms / 3_600_000));
}

/** Queue-age RAG banding: green < 24h, amber 24–48h, red > 48h. */
export function ageBand(hours: number): QueueBand {
  if (hours > 48) return "red";
  if (hours > 24) return "amber";
  return "green";
}

/** Median of a numeric list (0 for empty); average of the middle pair when even. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Age + band for the OPEN (undecided) items only, oldest first. */
export function openQueueAges(items: readonly QueueItem[], now: Date): QueueAgeRow[] {
  return items
    .filter((i) => !i.decidedAt)
    .map((i) => {
      const h = ageHours(i.enqueuedAt, now);
      return { ref: i.ref, ageHours: h, band: ageBand(h) };
    })
    .sort((a, b) => b.ageHours - a.ageHours);
}

/** Count of agent runs that halted fail-closed (verdict OPERATOR REVIEW). */
export function openFailClosedCount(runs: readonly AgentRunSummary[]): number {
  return runs.filter((r) => r.verdict === "OPERATOR REVIEW").length;
}

export interface MonitoringSnapshot {
  generatedAt: string;
  autonomous: boolean;
  usage: { monthTokens: number; budget: number | null };
  gates: { cleared: number; total: number };
  queue: {
    open: number;
    medianAgeHours: number;
    targetHours: number;
    breaching: number;
    items: QueueAgeRow[];
  };
  failClosed: { open: number };
  agentRuns: { total: number; draftReady: number; operatorReview: number };
  /** Structurally 0 — agents have no egress beyond enqueue_for_signoff. */
  agentEgress: number;
}

export interface SnapshotInput {
  now: Date;
  autonomous: boolean;
  gatesCleared: number;
  queue: readonly QueueItem[];
  runs: readonly AgentRunSummary[];
  /** Model-token metering: month-to-date spend + the configured cap (null = unmetered). */
  usage?: { monthTokens: number; budget: number | null };
}

/** Assemble the full monitoring snapshot from loaded rows. */
export function buildSnapshot(input: SnapshotInput): MonitoringSnapshot {
  const ages = openQueueAges(input.queue, input.now);
  const operatorReview = openFailClosedCount(input.runs);
  return {
    generatedAt: input.now.toISOString(),
    autonomous: input.autonomous,
    usage: input.usage ?? { monthTokens: 0, budget: null },
    gates: { cleared: input.gatesCleared, total: GATES_TOTAL },
    queue: {
      open: ages.length,
      medianAgeHours: median(ages.map((a) => a.ageHours)),
      targetHours: QUEUE_TARGET_HOURS,
      breaching: ages.filter((a) => a.ageHours > QUEUE_TARGET_HOURS).length,
      items: ages,
    },
    failClosed: { open: operatorReview },
    agentRuns: {
      total: input.runs.length,
      draftReady: input.runs.filter((r) => r.verdict === "DRAFT READY").length,
      operatorReview,
    },
    agentEgress: 0,
  };
}
