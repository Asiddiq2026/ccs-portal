// CF30 quarterly-return filing (AR channel). The golden rule holds: an AR does
// not write a FINAL return. Filing a NIL return creates a PENDING sign-off draft
// targeting `cf30_return`, routed to Razlin's SMF sign-off queue — only an
// audited SMF sign-off materialises the FINAL cf30_return row (Invariants 1 & 3).
// The due date + quarter label come from the deterministic engine, never a
// hand-typed value or an agent (Invariant 7). DB-free: depends only on injected
// interfaces so it unit-tests with in-memory stubs.
import type { AuditWriter, RegisterStore, Tenant } from "../tools/types";
import { buildCf30Return } from "../models/cf30";

// The 12 SUP 12 reporting sections an AR declares NIL against. Kept in code so
// the declaration is fixed and auditable, not free-typed.
export const NIL_SECTIONS = [
  "Complaints",
  "Breaches",
  "FPs off-platform",
  "Conflicts",
  "G&E",
  "AML flags",
  "Market abuse",
  "Data incidents",
  "PAD",
  "Whistleblowing",
  "Client money",
  "Other",
] as const;

/** Domain error carrying an HTTP-ish status so the route can map it directly. */
export class Cf30Error extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "Cf30Error";
  }
}

export interface Cf30Deps {
  // Only the PENDING-draft path is needed; a NIL return never writes FINAL here.
  store: Pick<RegisterStore, "createPendingDraft">;
  audit: AuditWriter;
}

export interface FileNilInput {
  arId: string;
  /** YYYY-MM-DD inside the quarter being returned (engine derives quarter+due). */
  referenceDate: string;
  /** Named human declaration (e.g. "Rachel Bailey · Director"). Required. */
  declaredBy: string;
}

export interface Cf30FilingResult {
  id: string;
  quarter: string;
  dueDate: string;
  status: "PENDING";
}

/**
 * File a NIL CF30 return. An AR may only file for its own firm; COMPLIANCE/SMF
 * may file on behalf of a named firm. Produces a PENDING sign-off draft (never a
 * FINAL row) and an append-only audit entry.
 */
export async function fileNilReturn(
  deps: Cf30Deps,
  tenant: Tenant,
  input: FileNilInput,
): Promise<Cf30FilingResult> {
  if (tenant.role === "AR" && tenant.arId !== input.arId) {
    throw new Cf30Error(403, "forbidden: an AR cannot file for another firm");
  }
  if (!input.declaredBy.trim()) {
    throw new Cf30Error(400, "a named declaration is required (SUP 12)");
  }

  // Deterministic engine owns the quarter label + due date. exceptions = 0 is
  // what makes this a NIL return.
  const model = buildCf30Return({
    arId: input.arId,
    referenceDate: input.referenceDate,
    exceptions: 0,
  });

  const summary = `NIL return · ${model.data.quarter} · all ${NIL_SECTIONS.length} sections NIL · declared by ${input.declaredBy.trim()}`;
  const actor = `${tenant.role}:${tenant.arId || "network"}`;

  // Payload is shaped for the cf30_return register schema (validated again at
  // sign-off). dueDate is an ISO calendar date; the schema coerces it.
  const draft = await deps.store.createPendingDraft(
    {
      register: "cf30_return",
      arId: input.arId,
      payload: {
        arId: input.arId,
        quarter: model.data.quarter,
        dueDate: model.dueDate,
        exceptions: 0,
      },
      summary,
      createdBy: actor,
    },
    tenant,
  );

  await deps.audit.append(
    { actor, action: "CF30 NIL FILED", entity: "cf30_return", entityId: draft.id },
    tenant,
  );

  return { id: draft.id, quarter: model.data.quarter, dueDate: model.dueDate, status: "PENDING" };
}
