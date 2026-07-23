// POST /api/training/completions — operator import (Phase 1, option B) of
// training-completion evidence from the training platform. An operator
// (COMPLIANCE/SMF) uploads a batch; each row is written append-only to
// training_completion. This does NOT touch person_cpd — the three-strike CPD
// row is drafted for SMF sign-off separately by agent-cpd-tracker, which reads
// this evidence (Invariants 1, 3, 4).
//
// Body (JSON): { arId, completions: [{ person, moduleId, moduleTitle, quarter,
//   score, outOf, pct, passed, certificateId?, completedAt }] }.
// Errors: 401 · 403 · 400. Success: 201 { arId, recorded, ids }.
//
// Phase 2 will add a service-token endpoint so the training platform can post in
// real time; for now ingest is operator-driven and human-scoped.
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { prismaAudit } from "@/lib/tools/prisma-adapters";
import { prismaTrainingStore } from "@/lib/training/prisma-adapter";
import { recordCompletions, TrainingError } from "@/lib/training/service";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Operator import only in Phase 1. ARs and the real-time service-token path
  // arrive in Phase 2.
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    return NextResponse.json({ error: "operators only" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await recordCompletions(
      { store: prismaTrainingStore, audit: prismaAudit },
      tenant,
      body,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const status = err instanceof TrainingError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
