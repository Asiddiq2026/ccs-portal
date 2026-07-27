// POST /api/ars/status — propose an AR status change (SUP 12). Validated
// against the coded transition state machine, then routed to sign-off as a
// PENDING appointed_rep draft. Does not change the register; only an audited
// SMF sign-off does (Invariants 1 & 3). Operators only.
// Body (JSON): { arId, status, reason }. Errors: 401 · 403 · 400 · 404 · 409.
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { arPrismaDeps } from "@/lib/ar/prisma-adapter";
import { proposeArStatusChange, ArError, type ArStatus } from "@/lib/ar/service";

export const runtime = "nodejs";

const STATUSES: ArStatus[] = ["ONBOARDING", "ACTIVE", "SUSPENDED", "TERMINATED"];

export async function POST(req: Request): Promise<Response> {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = (await req.json()) as unknown;
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const arId = typeof body.arId === "string" ? body.arId.trim() : "";
  const status = body.status as ArStatus;
  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!arId || !STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `arId and a valid status (${STATUSES.join(", ")}) are required` },
      { status: 400 },
    );
  }

  try {
    const result = await proposeArStatusChange(arPrismaDeps, tenant, { arId, status, reason });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const status = err instanceof ArError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
