// CPD & certification channel. This is where the training integration closes
// its loop: append-only training_completion evidence is credited by the
// deterministic engine, compared against the FINAL person_cpd register row, and
// any difference is PROPOSED as a PENDING sign-off draft — never written
// straight to the register (Invariants 1 & 3).
//
// The register row is the signed-off regulatory position. The evidence-derived
// figure is what the completions actually support. When they disagree the
// register is stale, and only an audited SMF sign-off may move it.
//
// All arithmetic — credited hours, months remaining, strike level — comes from
// the engine, never from a model (Invariant 7). DB-free: injected interfaces.
import { creditedCpdHours, cpdStrike, monthsUntil } from "../engine";
import type { AuditWriter, RegisterStore, Tenant } from "../tools/types";
import type { TrainingStore } from "../training/service";

export const DEFAULT_REQUIRED_HOURS = 35;

export class CpdError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CpdError";
  }
}

/** A FINAL person_cpd register row. */
export interface CpdRegisterRow {
  id: string;
  arId: string;
  person: string;
  cpdHours: number;
  required: number;
  strikes: number;
  certExpiry: string;
}

/** The register position beside what the evidence currently supports. */
export interface CpdStanding {
  arId: string;
  person: string;
  required: number;
  certExpiry: string;
  monthsLeft: number;
  /** Signed-off position. */
  recordedHours: number;
  recordedStrikes: number;
  /** Derived from training_completion evidence, right now. */
  creditedHours: number;
  derivedStrikes: number;
  /** True when the signed-off row no longer matches the evidence. */
  drift: boolean;
  /** Modules passed that earned credit. */
  modulesPassed: number;
}

export interface CpdStore {
  listPersonCpd(filter: { arId?: string }, tenant: Tenant): Promise<CpdRegisterRow[]>;
}

export interface CpdDeps {
  store: CpdStore;
  training: Pick<TrainingStore, "listCompletions">;
  register: Pick<RegisterStore, "createPendingDraft">;
  audit: AuditWriter;
}

function actorOf(tenant: Tenant): string {
  return `${tenant.role}:${tenant.arId || "network"}`;
}

function assertFirmScope(tenant: Tenant, arId?: string): void {
  if (tenant.role === "AR" && arId && arId !== tenant.arId) {
    throw new CpdError(403, "forbidden: an AR cannot read another firm's CPD records");
  }
}

/**
 * CPD standing for a firm (or the network). Joins each signed-off person_cpd row
 * to the training evidence for that person and flags drift.
 */
export async function cpdStanding(
  deps: CpdDeps,
  tenant: Tenant,
  filter: { arId?: string } = {},
  nowIso: string = new Date().toISOString(),
): Promise<CpdStanding[]> {
  assertFirmScope(tenant, filter.arId);

  const rows = await deps.store.listPersonCpd(filter, tenant);
  const standings: CpdStanding[] = [];

  for (const row of rows) {
    const completions = await deps.training.listCompletions(
      { arId: row.arId, person: row.person },
      tenant,
    );
    const creditedHours = creditedCpdHours(completions);
    const monthsLeft = monthsUntil(row.certExpiry, nowIso);
    const required = row.required || DEFAULT_REQUIRED_HOURS;
    const derivedStrikes = cpdStrike({ hours: creditedHours, required, monthsLeft });

    standings.push({
      arId: row.arId,
      person: row.person,
      required,
      certExpiry: row.certExpiry,
      monthsLeft,
      recordedHours: row.cpdHours,
      recordedStrikes: row.strikes,
      creditedHours,
      derivedStrikes,
      drift: creditedHours !== row.cpdHours || derivedStrikes !== row.strikes,
      modulesPassed: completions.filter((c) => c.passed).length,
    });
  }

  // Most at-risk first: highest derived strike, then least time remaining.
  return standings.sort(
    (a, b) => b.derivedStrikes - a.derivedStrikes || a.monthsLeft - b.monthsLeft,
  );
}

export interface ProposeInput {
  arId: string;
  person: string;
}

/**
 * Propose bringing a person's person_cpd row into line with the evidence. This
 * creates a PENDING sign-off draft — it does NOT write the register. Only an
 * audited SMF sign-off materialises it (the generic sign-off queue already
 * validates the payload against the person_cpd schema).
 */
export async function proposeCpdUpdate(
  deps: CpdDeps,
  tenant: Tenant,
  input: ProposeInput,
  nowIso: string = new Date().toISOString(),
): Promise<{ id: string; status: "PENDING"; creditedHours: number; strikes: number }> {
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    throw new CpdError(403, "forbidden: only an operator may propose a CPD update");
  }

  const standings = await cpdStanding(deps, tenant, { arId: input.arId }, nowIso);
  const person = standings.find((s) => s.person === input.person);
  if (!person) throw new CpdError(404, "no CPD record for that person");
  if (!person.drift) {
    throw new CpdError(409, "the register already matches the evidence — nothing to propose");
  }

  const draft = await deps.register.createPendingDraft(
    {
      register: "person_cpd",
      arId: person.arId,
      payload: {
        arId: person.arId,
        person: person.person,
        cpdHours: person.creditedHours,
        required: person.required,
        strikes: person.derivedStrikes,
        certExpiry: person.certExpiry,
      },
      summary:
        `CPD update for ${person.person} — ${person.creditedHours}/${person.required}h ` +
        `from ${person.modulesPassed} passed module${person.modulesPassed === 1 ? "" : "s"}, ` +
        `strike ${person.derivedStrikes} (was ${person.recordedHours}h / strike ${person.recordedStrikes})`,
      createdBy: actorOf(tenant),
    },
    tenant,
  );

  await deps.audit.append(
    {
      actor: actorOf(tenant),
      action: "CPD UPDATE PROPOSED",
      entity: "person_cpd",
      entityId: draft.id,
    },
    tenant,
  );

  return {
    id: draft.id,
    status: "PENDING",
    creditedHours: person.creditedHours,
    strikes: person.derivedStrikes,
  };
}
