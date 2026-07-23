// Financial Promotions channel (Phase 4) — submission, WORM document manifest,
// and SMF sign-off. The golden rule holds here too: an AR *submits* (status
// PENDING); only an SMF Adopt/Reject transitions status, and every state change
// writes an append-only AuditEvent. The service depends only on injected
// interfaces (store / audit / blob) so it runs in tests with no DB and no Azure.
import type { AuditWriter, Tenant } from "../tools/types";
import type { BlobStore } from "./storage";

export type FpType = "RESEARCH" | "TEASER" | "DECK" | "MARKETING" | "ADVISORY";
export type FpStatus = "PENDING" | "ADOPTED" | "REJECTED";

/** One COBS 4 checklist line as ticked (or not) by the submitting AR. */
export interface CobsItem {
  label: string;
  checked: boolean;
}

/** The DB-side manifest of a stored document — never the bytes. */
export interface FpDocumentManifest {
  name: string;
  size: number;
  sha256: string;
  blobUrl: string;
}

export interface FpRecord {
  id: string;
  arId: string;
  ref: string;
  type: FpType;
  title: string;
  audience: string;
  cobs: CobsItem[];
  status: FpStatus;
  submittedBy: string;
  reviewedBy: string | null;
  reviewerNotes: string | null;
}

// ---- Injected persistence ---------------------------------------------------

export interface FpStore {
  /** Creates a PENDING promotion, assigning the human-facing FP-#### ref. */
  createPromotion(
    input: {
      arId: string;
      type: FpType;
      title: string;
      audience: string;
      cobs: CobsItem[];
      submittedBy: string;
    },
    tenant: Tenant,
  ): Promise<FpRecord>;

  addDocuments(
    promotionId: string,
    arId: string,
    docs: FpDocumentManifest[],
    tenant: Tenant,
  ): Promise<void>;

  getPromotion(id: string, tenant: Tenant): Promise<FpRecord | null>;

  setDecision(
    id: string,
    decision: { status: Exclude<FpStatus, "PENDING">; reviewedBy: string; reviewerNotes: string | null },
    tenant: Tenant,
  ): Promise<FpRecord>;
}

export interface FpDeps {
  store: FpStore;
  audit: AuditWriter;
  blob: BlobStore;
}

/** Domain error carrying an HTTP-ish status so routes can map it directly. */
export class FpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FpError";
  }
}

// ---- Actions ----------------------------------------------------------------

export interface SubmitInput {
  arId: string;
  type: FpType;
  title: string;
  audience: string;
  cobs: CobsItem[];
  submittedBy: string;
  files: { name: string; contentType?: string; bytes: Uint8Array }[];
}

/**
 * AR submission: hash + WORM-store every file, create the promotion PENDING,
 * attach the document manifest, and write SUBMITTED (+ DOCS ATTACHED) audit
 * rows. An AR may only submit for its own firm; COMPLIANCE/SMF may submit on
 * behalf of any firm (RLS still scopes reads).
 */
export async function submitPromotion(
  deps: FpDeps,
  tenant: Tenant,
  input: SubmitInput,
): Promise<{ promotion: FpRecord; documents: FpDocumentManifest[] }> {
  if (tenant.role === "AR" && tenant.arId !== input.arId) {
    throw new FpError(403, "forbidden: an AR cannot submit for another firm");
  }
  if (input.cobs.length === 0) {
    throw new FpError(400, "a COBS 4 checklist is required");
  }

  // 1) Content-address every file into WORM storage.
  const documents: FpDocumentManifest[] = [];
  for (const f of input.files) {
    const stored = await deps.blob.put(f);
    documents.push({ name: f.name, size: stored.size, sha256: stored.sha256, blobUrl: stored.blobUrl });
  }

  // 2) Create the promotion PENDING.
  const promotion = await deps.store.createPromotion(
    {
      arId: input.arId,
      type: input.type,
      title: input.title,
      audience: input.audience,
      cobs: input.cobs,
      submittedBy: input.submittedBy,
    },
    tenant,
  );

  // 3) Attach the manifest.
  if (documents.length > 0) {
    await deps.store.addDocuments(promotion.id, input.arId, documents, tenant);
  }

  // 4) Immutable audit trail.
  await deps.audit.append(
    { actor: input.submittedBy, action: "SUBMITTED", entity: "financial_promotion", entityId: promotion.id },
    tenant,
  );
  if (documents.length > 0) {
    await deps.audit.append(
      { actor: input.submittedBy, action: "DOCS ATTACHED", entity: "financial_promotion", entityId: promotion.id },
      tenant,
    );
  }

  return { promotion, documents };
}

export interface DecisionInput {
  id: string;
  decision: "ADOPT" | "REJECT";
  actor: string;
  /** Required on REJECT (reviewer notes are surfaced to the AR to revise). */
  notes?: string;
}

/**
 * SMF Adopt/Reject — the sole authority to transition an FP out of PENDING
 * (Invariant: SMF is the sole sign-off). Writes an ADOPTED / REJECTED audit row.
 */
export async function decidePromotion(
  deps: FpDeps,
  tenant: Tenant,
  input: DecisionInput,
): Promise<FpRecord> {
  if (tenant.role !== "SMF") {
    throw new FpError(403, "forbidden: only an SMF may adopt or reject a promotion");
  }
  if (input.decision === "REJECT" && !input.notes?.trim()) {
    throw new FpError(400, "reject requires reviewer notes");
  }

  const existing = await deps.store.getPromotion(input.id, tenant);
  if (!existing) throw new FpError(404, "no such promotion");
  if (existing.status !== "PENDING") {
    throw new FpError(409, `promotion already ${existing.status.toLowerCase()}`);
  }

  const status = input.decision === "ADOPT" ? "ADOPTED" : "REJECTED";
  const updated = await deps.store.setDecision(
    input.id,
    { status, reviewedBy: input.actor, reviewerNotes: input.notes ?? null },
    tenant,
  );

  await deps.audit.append(
    { actor: input.actor, action: status, entity: "financial_promotion", entityId: input.id },
    tenant,
  );

  return updated;
}
