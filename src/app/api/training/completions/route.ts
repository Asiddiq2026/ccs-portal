// POST /api/training/completions — ingest training-completion evidence from the
// training platform. Two authenticated paths, both landing append-only rows in
// training_completion (Invariants 1, 3, 4); person_cpd is drafted for SMF
// sign-off separately by agent-cpd-tracker, which reads this evidence.
//
//   1. Service token (Phase 2) — `Authorization: Bearer <token>`. Resolves to an
//      AR-scoped machine tenant (a token can only write its own firm), for
//      real-time posting by the training platform.
//   2. Operator import (Phase 1) — a COMPLIANCE/SMF session uploads a batch.
//
// Body (JSON): { arId, completions: [{ person, moduleId, moduleTitle, quarter,
//   score, outOf, pct, passed, certificateId?, completedAt }] }.
// Errors: 401 · 403 · 400. Success: 201 { arId, recorded, ids }.
import { NextResponse } from "next/server";
import type { TenantContext } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { prismaTrainingStore } from "@/lib/training/prisma-adapter";
import { recordCompletions, TrainingError } from "@/lib/training/service";
import { parseTokenRegistry, serviceTokenTenant } from "@/lib/training/service-token";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  let tenant: TenantContext;

  if (authHeader) {
    // Service-token path. A present-but-invalid bearer token is 401 — we never
    // fall back to a session when a token was offered.
    const machine = serviceTokenTenant(authHeader, parseTokenRegistry(process.env.TRAINING_INGEST_TOKENS));
    if (!machine) {
      return NextResponse.json({ error: "invalid service token" }, { status: 401 });
    }
    tenant = machine;
  } else {
    // Operator-import path (COMPLIANCE/SMF session).
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
    // The service (and RLS) enforce firm scope: an AR-scoped token or AR session
    // whose arId differs from the body's arId is rejected 403.
    const result = await recordCompletions({ store: prismaTrainingStore }, tenant, body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const status = err instanceof TrainingError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
