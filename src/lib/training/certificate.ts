// Training-certificate storage: the PDF bytes go into the content-addressed
// WORM blob store; the DB keeps only the manifest (name, sha256, size, blobUrl),
// exactly like PromotionDocument. A stored certificate is then referenceable as
// sign-off evidence via gather_docs (evidence_pack) — this module never writes a
// register or a FINAL row.
//
// DB-free / SDK-free: depends only on injected BlobStore + CertificateStore
// interfaces, so it unit-tests with the in-memory blob store and a stub store.
import { z } from "zod";
import type { Tenant } from "../tools/types";
import type { BlobStore } from "../fp/storage";

/** 10 MB ceiling — a training certificate PDF is small; anything larger is rejected. */
export const MAX_CERT_BYTES = 10 * 1024 * 1024;

export class CertificateError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CertificateError";
  }
}

export const certificateInputSchema = z
  .object({
    arId: z.string().min(1),
    person: z.string().min(1),
    moduleId: z.string().min(1),
    certificateId: z.string().min(1),
    filename: z.string().min(1),
    /** Base64-encoded PDF bytes. */
    contentBase64: z.string().min(1),
  })
  .strip();

export type CertificateInput = z.infer<typeof certificateInputSchema>;

export interface CertManifest {
  arId: string;
  person: string;
  moduleId: string;
  certificateId: string;
  name: string;
  sha256: string;
  size: number;
  blobUrl: string;
}

export interface CertAudit {
  actor: string;
  action: string;
  entity: string;
  entityId?: string;
}

/** Evidence-pack doc shape (what gather_docs consumes). */
export interface EvidenceDoc {
  name: string;
  sha256: string;
  blobUrl: string;
  size: number;
}

export interface CertificateStore {
  /** Append the manifest + its audit entry in one transaction (append-only). */
  record(input: { manifest: CertManifest; audit: CertAudit }, tenant: Tenant): Promise<{ id: string }>;
  /** Stored certificates for a firm (optionally one person), as evidence docs. */
  listForEvidence(
    filter: { arId: string; person?: string },
    tenant: Tenant,
  ): Promise<EvidenceDoc[]>;
}

export interface CertificateDeps {
  blob: BlobStore;
  store: CertificateStore;
}

function actorOf(tenant: Tenant): string {
  return `${tenant.role}:${tenant.arId || "network"}`;
}

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

/**
 * Store a training-certificate PDF in WORM and record its manifest. Firm-scoped
 * (an AR / AR-scoped token can only store for its own firm). Fail-closed on a
 * cross-firm attempt, invalid base64, an oversize payload, or non-PDF content.
 */
export async function storeCertificate(
  deps: CertificateDeps,
  tenant: Tenant,
  input: unknown,
): Promise<{ sha256: string; blobUrl: string; size: number }> {
  const parsed = certificateInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CertificateError(
      400,
      `invalid certificate: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
    );
  }
  const data = parsed.data;
  if (tenant.role === "AR" && tenant.arId !== data.arId) {
    throw new CertificateError(403, "forbidden: cannot store a certificate for another firm");
  }

  const b64 = data.contentBase64.replace(/\s+/g, "");
  if (!BASE64_RE.test(b64)) {
    throw new CertificateError(400, "contentBase64 is not valid base64");
  }
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  if (bytes.length === 0) {
    throw new CertificateError(400, "certificate is empty");
  }
  if (bytes.length > MAX_CERT_BYTES) {
    throw new CertificateError(400, `certificate exceeds ${MAX_CERT_BYTES} bytes`);
  }
  if (!PDF_MAGIC.every((b, i) => bytes[i] === b)) {
    throw new CertificateError(400, "certificate must be a PDF");
  }

  // WORM write. put() is content-addressed + idempotent, so re-storing the same
  // certificate returns the same immutable URL rather than duplicating bytes.
  const stored = await deps.blob.put({
    name: data.filename,
    contentType: "application/pdf",
    bytes,
  });

  await deps.store.record(
    {
      manifest: {
        arId: data.arId,
        person: data.person,
        moduleId: data.moduleId,
        certificateId: data.certificateId,
        name: data.filename,
        sha256: stored.sha256,
        size: stored.size,
        blobUrl: stored.blobUrl,
      },
      audit: {
        actor: actorOf(tenant),
        action: "CERTIFICATE STORED",
        entity: "training_certificate",
        entityId: data.certificateId,
      },
    },
    tenant,
  );

  return { sha256: stored.sha256, blobUrl: stored.blobUrl, size: stored.size };
}
