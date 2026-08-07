// Disposition of fail-closed agent runs. A run that halts to OPERATOR REVIEW is
// the platform's loudest safety signal (Invariant 2). Previously the monitoring
// count of open halts could only grow — there was no way to record that a human
// had actually looked. This closes that loop: an operator records a review with
// a required rationale, which is an append-only, auditable disposition; the
// "open fail-closed" metric then counts only halts NOT yet reviewed.
//
// The review is deliberately NOT a flag on agent_run (which is append-only) — it
// is a separate fail_closed_review row, one per run, operator-only.
import type { AuditWriter, Tenant } from "../tools/types";

export class FailClosedError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FailClosedError";
  }
}

export interface FailClosedReview {
  runId: string;
  reviewer: string;
  rationale: string;
  ts: Date;
}

export interface FailClosedStore {
  /** The run must exist, be visible to the caller, and be an OPERATOR REVIEW. */
  getRunVerdict(runId: string, tenant: Tenant): Promise<"DRAFT READY" | "OPERATOR REVIEW" | null>;
  /** Null if no review yet. */
  getReview(runId: string, tenant: Tenant): Promise<FailClosedReview | null>;
  /** Insert the review. Must reject (unique runId) a second review for a run. */
  insertReview(input: FailClosedReview, tenant: Tenant): Promise<void>;
}

export interface FailClosedDeps {
  store: FailClosedStore;
  audit: AuditWriter;
}

export interface RecordReviewInput {
  runId: string;
  rationale: string;
}

/**
 * Record an operator's disposition of a fail-closed run. Operator-only; a
 * rationale is required (an empty disposition is not a disposition). Fails
 * closed: a run that isn't an OPERATOR REVIEW, or is already reviewed, is
 * rejected rather than silently accepted.
 */
export async function recordFailClosedReview(
  deps: FailClosedDeps,
  tenant: Tenant,
  input: RecordReviewInput,
  now: Date = new Date(),
): Promise<FailClosedReview> {
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    throw new FailClosedError(403, "only an operator may review a fail-closed run");
  }
  const rationale = (input.rationale ?? "").trim();
  if (!rationale) {
    throw new FailClosedError(400, "a rationale is required to record a fail-closed review");
  }

  const verdict = await deps.store.getRunVerdict(input.runId, tenant);
  if (verdict === null) throw new FailClosedError(404, "agent run not found or not visible");
  if (verdict !== "OPERATOR REVIEW") {
    throw new FailClosedError(409, "that run did not fail closed — nothing to review");
  }

  const existing = await deps.store.getReview(input.runId, tenant);
  if (existing) {
    throw new FailClosedError(409, "this run has already been reviewed");
  }

  const review: FailClosedReview = {
    runId: input.runId,
    reviewer: `${tenant.role}:${tenant.arId || "network"}`,
    rationale,
    ts: now,
  };
  await deps.store.insertReview(review, tenant);

  // The disposition is itself an audited event (tamper-evident, like every
  // other decision). An audit failure must not undo the recorded review.
  try {
    await deps.audit.append(
      {
        actor: review.reviewer,
        action: "FAIL-CLOSED REVIEWED",
        entity: "agent_run",
        entityId: input.runId,
      },
      tenant,
    );
  } catch {
    /* ledger failure never masks a completed disposition */
  }

  return review;
}
