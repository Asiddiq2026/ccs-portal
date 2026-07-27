// AR roster (SUP 12). The principal firm maintains the register of its
// appointed representatives and their status. Appointing, suspending and
// terminating an AR are regulated acts with FCA notification consequences, so a
// status change is PROPOSED as a PENDING sign-off draft targeting appointed_rep
// — never written directly (Invariants 1 & 3). Operators only: an AR cannot
// change its own standing.
//
// Transitions are a coded state machine, so an impossible move (e.g. reviving a
// terminated firm) is refused by the platform rather than left to judgement.
import type { AuditWriter, RegisterStore, Tenant } from "../tools/types";
import type { RiskBandName } from "../engine";

export type ArStatus = "ONBOARDING" | "ACTIVE" | "SUSPENDED" | "TERMINATED";

/**
 * Permitted next states. TERMINATED is terminal: a firm that has been
 * terminated must be re-appointed through a fresh FCA notification, not
 * resurrected by editing a row.
 */
export const AR_TRANSITIONS: Record<ArStatus, readonly ArStatus[]> = {
  ONBOARDING: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["SUSPENDED", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  TERMINATED: [],
};

/** Why each move matters — surfaced in the UI so the act is not casual. */
export const TRANSITION_NOTE: Record<ArStatus, string> = {
  ACTIVE: "Firm may carry on regulated activity within the scope of its appointment.",
  SUSPENDED: "Activity paused pending remediation. The appointment remains on the FCA register.",
  TERMINATED: "Appointment ended. Requires an FCA notification and starts the record-retention clock.",
  ONBOARDING: "Pre-appointment checks in progress. No regulated activity permitted yet.",
};

export class ArError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ArError";
  }
}

export interface ArRecord {
  id: string;
  arId: string;
  frn: string;
  legalName: string;
  status: ArStatus;
  onboardedAt: string;
  riskBand: RiskBandName | null;
}

/** A roster entry with the oversight load currently attached to it. */
export interface ArRosterEntry extends ArRecord {
  allowedNext: readonly ArStatus[];
  openPromotions: number;
  openBreaches: number;
  pendingSignoffs: number;
}

export interface ArStore {
  listArs(filter: { arId?: string }, tenant: Tenant): Promise<ArRecord[]>;
  getAr(arId: string, tenant: Tenant): Promise<ArRecord | null>;
  /** Open-item counts per firm, for the oversight-load columns. */
  openCounts(
    tenant: Tenant,
  ): Promise<Record<string, { promotions: number; breaches: number; signoffs: number }>>;
}

export interface ArDeps {
  store: ArStore;
  register: Pick<RegisterStore, "createPendingDraft">;
  audit: AuditWriter;
}

function actorOf(tenant: Tenant): string {
  return `${tenant.role}:${tenant.arId || "network"}`;
}

function assertOperator(tenant: Tenant): void {
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    throw new ArError(403, "forbidden: the AR roster is maintained by the principal firm");
  }
}

/** The roster with each firm's allowed next states and open oversight items. */
export async function arRoster(
  deps: ArDeps,
  tenant: Tenant,
  filter: { arId?: string } = {},
): Promise<ArRosterEntry[]> {
  assertOperator(tenant);
  const [ars, counts] = await Promise.all([
    deps.store.listArs(filter, tenant),
    deps.store.openCounts(tenant),
  ]);

  return ars
    .map((ar) => {
      const c = counts[ar.arId] ?? { promotions: 0, breaches: 0, signoffs: 0 };
      return {
        ...ar,
        allowedNext: AR_TRANSITIONS[ar.status] ?? [],
        openPromotions: c.promotions,
        openBreaches: c.breaches,
        pendingSignoffs: c.signoffs,
      };
    })
    .sort((a, b) => {
      // Live firms first, then by oversight load.
      const rank = (s: ArStatus) => (s === "TERMINATED" ? 2 : s === "SUSPENDED" ? 0 : 1);
      return (
        rank(a.status) - rank(b.status) ||
        b.openBreaches + b.openPromotions - (a.openBreaches + a.openPromotions)
      );
    });
}

export interface ProposeStatusInput {
  arId: string;
  status: ArStatus;
  /** Required — the reason is part of the regulated record. */
  reason: string;
}

/**
 * Propose a status change for an AR. Validates the transition against the coded
 * state machine, then creates a PENDING sign-off draft carrying the full
 * appointed_rep row. Does not change the register.
 */
export async function proposeArStatusChange(
  deps: ArDeps,
  tenant: Tenant,
  input: ProposeStatusInput,
): Promise<{ id: string; status: "PENDING"; from: ArStatus; to: ArStatus }> {
  assertOperator(tenant);
  if (!input.reason?.trim()) {
    throw new ArError(400, "a reason is required — it forms part of the regulated record");
  }

  const existing = await deps.store.getAr(input.arId, tenant);
  if (!existing) throw new ArError(404, "no such appointed representative");

  const allowed = AR_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(input.status)) {
    throw new ArError(
      409,
      existing.status === "TERMINATED"
        ? "a terminated appointment cannot be revived — re-appoint via a fresh FCA notification"
        : `cannot move ${existing.status} -> ${input.status} (allowed: ${allowed.join(", ") || "none"})`,
    );
  }

  const draft = await deps.register.createPendingDraft(
    {
      register: "appointed_rep",
      arId: existing.arId,
      payload: {
        arId: existing.arId,
        frn: existing.frn,
        legalName: existing.legalName,
        status: input.status,
        onboardedAt: existing.onboardedAt,
        riskBand: existing.riskBand,
      },
      summary:
        `AR status ${existing.status} -> ${input.status} for ${existing.legalName} ` +
        `(FRN ${existing.frn}) — ${input.reason.trim()}`,
      createdBy: actorOf(tenant),
    },
    tenant,
  );

  await deps.audit.append(
    {
      actor: actorOf(tenant),
      action: "AR STATUS CHANGE PROPOSED",
      entity: "appointed_rep",
      entityId: draft.id,
    },
    tenant,
  );

  return { id: draft.id, status: "PENDING", from: existing.status, to: input.status };
}
