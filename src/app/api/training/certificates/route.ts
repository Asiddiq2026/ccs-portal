// POST /api/training/certificates — store a training-certificate PDF in the WORM
// blob store and record its manifest (append-only). The bytes are never kept in
// the DB. A stored certificate is referenceable as sign-off evidence via
// gather_docs (evidence_pack). Same dual auth as the completions ingest: a Bearer
// service token (AR-scoped) OR an operator session.
//
// Body (JSON): { arId, person, moduleId, certificateId, filename, contentBase64 }.
// Errors: 401 · 403 · 400. Success: 201 { sha256, blobUrl, size }.
import { NextResponse } from "next/server";
import type { TenantContext } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { resolveBlobStore } from "@/lib/fp/blob";
import { storeCertificate, CertificateError } from "@/lib/training/certificate";
import { prismaCertificateStore } from "@/lib/training/certificate-prisma-adapter";
import { parseTokenRegistry, serviceTokenTenant } from "@/lib/training/service-token";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  let tenant: TenantContext;

  if (authHeader) {
    const machine = serviceTokenTenant(authHeader, parseTokenRegistry(process.env.TRAINING_INGEST_TOKENS));
    if (!machine) {
      return NextResponse.json({ error: "invalid service token" }, { status: 401 });
    }
    tenant = machine;
  } else {
    try {
      tenant = await requireTenant();
    } catch {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
      return NextResponse.json({ error: "operators only" }, { status: 403 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const blob = await resolveBlobStore(process.env);
    const result = await storeCertificate({ blob, store: prismaCertificateStore }, tenant, body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const status = err instanceof CertificateError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
