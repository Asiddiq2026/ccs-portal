// Phase 9 — the sign-off decision path. This is the ONLY place a PENDING draft
// becomes a FINAL register row (Invariants 1 & 3): the API tool layer and the
// agents can only ever enqueue drafts; an audited SMF sign-off is the sole
// materialisation gate. Two terminal decisions:
//   SIGN_OFF — validate the payload against its register, write the FINAL row,
//              mark the item SIGNED_OFF. Both happen atomically in the store.
//   RETURN   — reject with a required rationale; NO register write.
// The service depends only on injected interfaces, so it is fully testable with
// no database. Any error/ambiguity fails closed (no FINAL row).
import type { AuditWriter, Tenant } from "../tools/types";
import { validateRegisterPayload } from "./register-schemas";
import { isArtifact, validateArtifactPayload } from "./artifacts";

export type SignOffDecision = "SIGN_OFF" | "RETURN";
// SUPERSEDED = replaced in the queue by a newer draft for the same register
// identity before any SMF decided it. Terminal, like RETURNED; never decided.
export type SignOffStatus = "PENDING" | "SIGNED_OFF" | "RETURNED" | "SUPERSEDED";

/** Thrown for caller errors — mapped to an HTTP status by the route. */
export class SignOffError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SignOffError";
  }
}

export interface SignOffDraft {
  id: string;
  arId: string;
  register: string;
  payload: Record<string, unknown>;
  summary: string;
  status: SignOffStatus;
}

// ---- Injected persistence ---------------------------------------------------

export interface SignOffStore {
  get(id: string, tenant: Tenant): Promise<SignOffDraft | null>;

  /**
   * Atomically: materialise `data` as a FINAL row in `register` AND flip the
   * item to SIGNED_OFF (guarded on it still being PENDING). Returns the new
   * register row id. Must throw SignOffError(409) if the item is no longer
   * PENDING (lost race).
   */
  signOff(
    input: {
      id: string;
      register: string;
      data: Record<string, unknown>;
      decidedBy: string;
      notes?: string;
    },
    tenant: Tenant,
  ): Promise<{ registerId: string }>;

  /** Flip the item to RETURNED with the rationale; no register write. */
  return(
    input: { id: string; decidedBy: string; notes: string },
    tenant: Tenant,
  ): Promise<void>;

  /**
   * Approve a non-register ARTIFACT: flip it to SIGNED_OFF with NO register
   * write (registerId stays null). Guarded on it still being PENDING.
   */
  approveArtifact(
    input: { id: string; decidedBy: string; notes?: string },
    tenant: Tenant,
  ): Promise<void>;
}

export interface SignOffDeps {
  store: SignOffStore;
  audit: AuditWriter;
}

export interface SignOffResult {
  draftId: string;
  decision: SignOffDecision;
  status: SignOffStatus;
  register: string;
  registerId?: string;
}

export interface DecideInput {
  draftId: string;
  decision: SignOffDecision;
  notes?: string;
}

/**
 * Decide a queued draft. SMF-only — the sole sign-off authority. Fail-closed:
 * a bad payload, unknown register, or non-PENDING item never produces a FINAL
 * row.
 */
export async function decideSignOff(
  deps: SignOffDeps,
  tenant: Tenant,
  input: DecideInput,
): Promise<SignOffResult> {
  if (tenant.role !== "SMF") {
    throw new SignOffError(403, "only SMF may sign off drafts");
  }

  const draft = await deps.store.get(input.draftId, tenant);
  if (!draft) throw new SignOffError(404, "draft not found or not visible to caller");
  if (draft.status !== "PENDING") {
    throw new SignOffError(409, `draft is ${draft.status}, not PENDING`);
  }

  if (input.decision === "RETURN") {
    const notes = (input.notes ?? "").trim();
    if (!notes) throw new SignOffError(400, "a rationale (notes) is required to return a draft");
    await deps.store.return({ id: draft.id, decidedBy: actor(tenant), notes }, tenant);
    await audit(deps, tenant, "SIGN-OFF RETURNED", "sign_off_item", draft.id);
    return { draftId: draft.id, decision: "RETURN", status: "RETURNED", register: draft.register };
  }

  // SIGN_OFF on a non-register ARTIFACT (prep/evidence pack): approve only —
  // validate the pack shape, flip to SIGNED_OFF, write NO register row.
  if (isArtifact(draft.register)) {
    const artifact = validateArtifactPayload(draft.register, draft.payload);
    if (!artifact.ok) {
      throw new SignOffError(
        422,
        `artifact ${draft.register} is malformed: ${(artifact.issues ?? []).join("; ")}`,
      );
    }
    await deps.store.approveArtifact(
      { id: draft.id, decidedBy: actor(tenant), notes: input.notes?.trim() || undefined },
      tenant,
    );
    await audit(deps, tenant, "ARTIFACT APPROVED", draft.register, draft.id);
    return { draftId: draft.id, decision: "SIGN_OFF", status: "SIGNED_OFF", register: draft.register };
  }

  // SIGN_OFF — validate the payload against its register before writing FINAL.
  const validated = validateRegisterPayload(draft.register, draft.payload);
  if (!validated.ok || !validated.data) {
    throw new SignOffError(
      422,
      `payload cannot be materialised into ${draft.register}: ${(validated.issues ?? []).join("; ")}`,
    );
  }

  const { registerId } = await deps.store.signOff(
    {
      id: draft.id,
      register: draft.register,
      data: validated.data,
      decidedBy: actor(tenant),
      notes: input.notes?.trim() || undefined,
    },
    tenant,
  );

  // Two audit rows: the sign-off decision and the FINAL register write.
  await audit(deps, tenant, "SIGNED OFF", "sign_off_item", draft.id);
  await audit(deps, tenant, "REGISTER WRITE (FINAL)", draft.register, registerId);

  return {
    draftId: draft.id,
    decision: "SIGN_OFF",
    status: "SIGNED_OFF",
    register: draft.register,
    registerId,
  };
}

function actor(tenant: Tenant): string {
  return `SMF:${tenant.arId || "network"}`;
}

async function audit(
  deps: SignOffDeps,
  tenant: Tenant,
  action: string,
  entity: string,
  entityId: string,
): Promise<void> {
  try {
    await deps.audit.append({ actor: actor(tenant), action, entity, entityId }, tenant);
  } catch {
    // An audit failure must not undo a completed decision.
  }
}
