// Data-breach channel (UK GDPR Art 33 / ICO). Mirrors the FP channel's shape:
// an AR *logs* a breach (status PENDING = ICO notification outstanding) and only
// an SMF transitions it. Every state change writes an append-only AuditEvent.
//
// WHY LOGGING IS IMMEDIATE, NOT A SIGN-OFF DRAFT: a breach is a fact that has
// already happened, and the 72-hour clock starts at detection. Holding the
// record itself in a queue would run the statutory clock down while the report
// waited. The regulated EGRESS — actually notifying the ICO — is what requires
// human authority: the notification is drafted DO-NOT-SEND (draft_template /
// agent-notification-drafter), routed to sign-off, and only an SMF may mark the
// breach REPORTED. No agent can file it (Invariants 1 & 3).
//
// The 72h deadline is computed by the deterministic engine, never typed in and
// never estimated by a model (Invariant 7). DB-free: injected interfaces only.
import { art33Deadline, art33Remaining, type Art33State } from "../engine";
import type { AuditWriter, Tenant } from "../tools/types";

export type BreachStatus = "PENDING" | "REPORTED" | "CLOSED";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const SEVERITIES: readonly Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export interface BreachRecord {
  id: string;
  arId: string;
  ref: string;
  /** When the firm became AWARE of the breach — the Art 33 clock starts here. */
  detectedAt: string;
  /** detectedAt + 72h, computed by the engine. */
  art33Clock: string;
  status: BreachStatus;
  severity: Severity;
}

/** A breach plus where its statutory clock stands right now. */
export interface BreachWithClock extends BreachRecord {
  hoursRemaining: number;
  state: Art33State;
}

export class BreachError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BreachError";
  }
}

export interface BreachStore {
  /** Creates a PENDING breach, assigning the human-facing BR-#### ref. */
  createBreach(
    input: { arId: string; detectedAt: Date; art33Clock: Date; severity: Severity },
    tenant: Tenant,
  ): Promise<BreachRecord>;
  getBreach(id: string, tenant: Tenant): Promise<BreachRecord | null>;
  listBreaches(filter: { arId?: string }, tenant: Tenant): Promise<BreachRecord[]>;
  setStatus(id: string, status: Exclude<BreachStatus, "PENDING">, tenant: Tenant): Promise<BreachRecord>;
}

export interface BreachDeps {
  store: BreachStore;
  audit: AuditWriter;
}

function actorOf(tenant: Tenant): string {
  return `${tenant.role}:${tenant.arId || "network"}`;
}

/** Attach the live Art 33 countdown. A settled breach has no running clock. */
export function withClock(b: BreachRecord, nowIso: string): BreachWithClock {
  if (b.status !== "PENDING") {
    return { ...b, hoursRemaining: 0, state: "ON_TRACK" };
  }
  return { ...b, ...art33Remaining(b.art33Clock, nowIso) };
}

export interface LogBreachInput {
  arId: string;
  /** ISO timestamp the firm became aware. Defaults to now; may not be future. */
  detectedAt?: string;
  severity: Severity;
}

/**
 * Log a data breach. An AR may only log for its own firm; COMPLIANCE/SMF may log
 * on behalf of a named firm. The 72h ICO deadline is derived from detectedAt by
 * the engine and stored, so the clock is fixed at the moment of awareness.
 */
export async function logBreach(
  deps: BreachDeps,
  tenant: Tenant,
  input: LogBreachInput,
  nowIso: string = new Date().toISOString(),
): Promise<BreachWithClock> {
  if (tenant.role === "AR" && tenant.arId !== input.arId) {
    throw new BreachError(403, "forbidden: an AR cannot log a breach for another firm");
  }
  if (!SEVERITIES.includes(input.severity)) {
    throw new BreachError(400, `severity must be one of ${SEVERITIES.join(", ")}`);
  }

  const detectedAt = input.detectedAt?.trim() || nowIso;
  const parsed = new Date(detectedAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new BreachError(400, "detectedAt is not a valid date");
  }
  // A future awareness time would hand the firm extra statutory runway.
  if (parsed.getTime() > new Date(nowIso).getTime()) {
    throw new BreachError(400, "detectedAt cannot be in the future");
  }

  const clock = art33Deadline(parsed.toISOString());
  const record = await deps.store.createBreach(
    {
      arId: input.arId,
      detectedAt: parsed,
      art33Clock: new Date(clock),
      severity: input.severity,
    },
    tenant,
  );

  await deps.audit.append(
    { actor: actorOf(tenant), action: "BREACH LOGGED", entity: "data_breach", entityId: record.id },
    tenant,
  );

  return withClock(record, nowIso);
}

/** Read the firm's breaches with their live clocks, most urgent first. */
export async function listBreaches(
  deps: BreachDeps,
  tenant: Tenant,
  filter: { arId?: string } = {},
  nowIso: string = new Date().toISOString(),
): Promise<BreachWithClock[]> {
  if (tenant.role === "AR" && filter.arId && filter.arId !== tenant.arId) {
    throw new BreachError(403, "forbidden: an AR cannot read another firm's breaches");
  }
  const rows = await deps.store.listBreaches(filter, tenant);
  return rows
    .map((b) => withClock(b, nowIso))
    .sort((a, b) => {
      // Open items first, then by least time remaining.
      if (a.status !== b.status) return a.status === "PENDING" ? -1 : 1;
      return a.hoursRemaining - b.hoursRemaining;
    });
}

export interface DecideBreachInput {
  id: string;
  /** REPORT = notified to the ICO (SMF has filed it). CLOSE = no notification due. */
  decision: "REPORT" | "CLOSE";
  actor: string;
  /** Required on CLOSE — the Art 33 assessment must be recorded. */
  notes?: string;
}

/**
 * SMF-only transition out of PENDING. REPORT records that the SMF has notified
 * the ICO; CLOSE records a reasoned decision that no notification is due. The
 * platform never files anything itself — this records a human action.
 */
export async function decideBreach(
  deps: BreachDeps,
  tenant: Tenant,
  input: DecideBreachInput,
  nowIso: string = new Date().toISOString(),
): Promise<BreachWithClock> {
  if (tenant.role !== "SMF") {
    throw new BreachError(403, "forbidden: only an SMF may close or report a breach");
  }
  if (input.decision === "CLOSE" && !input.notes?.trim()) {
    throw new BreachError(400, "closing without notification requires a recorded rationale");
  }

  const existing = await deps.store.getBreach(input.id, tenant);
  if (!existing) throw new BreachError(404, "no such breach");
  if (existing.status !== "PENDING") {
    throw new BreachError(409, `breach already ${existing.status.toLowerCase()}`);
  }

  const status = input.decision === "REPORT" ? "REPORTED" : "CLOSED";
  const updated = await deps.store.setStatus(input.id, status, tenant);

  await deps.audit.append(
    {
      actor: input.actor,
      action: status === "REPORTED" ? "BREACH REPORTED (ICO)" : "BREACH CLOSED — NO NOTIFICATION",
      entity: "data_breach",
      entityId: input.id,
    },
    tenant,
  );

  return withClock(updated, nowIso);
}
