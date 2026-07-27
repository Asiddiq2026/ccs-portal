// POST /api/breaches — log a data breach (UK GDPR Art 33). The 72-hour ICO
// deadline is computed server-side by the deterministic engine from the moment
// of awareness, so it can never be typed in or negotiated (Invariant 7).
// Logging records a FACT immediately; notifying the ICO is a separate SMF act.
// Body (JSON): { arId?, detectedAt?, severity }. arId is forced to the caller's
// firm for an AR. Errors: 401 · 400 · 403. Success: 201 { ...breach, hoursRemaining }.
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { breachPrismaDeps } from "@/lib/breach/prisma-adapter";
import { logBreach, BreachError, type Severity } from "@/lib/breach/service";

export const runtime = "nodejs";

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

  const arId =
    tenant.role === "AR" ? tenant.arId : typeof body.arId === "string" ? body.arId.trim() : "";
  if (!arId) {
    return NextResponse.json({ error: "arId is required for operator filings" }, { status: 400 });
  }

  try {
    const breach = await logBreach(breachPrismaDeps, tenant, {
      arId,
      detectedAt: typeof body.detectedAt === "string" ? body.detectedAt : undefined,
      severity: body.severity as Severity,
    });
    return NextResponse.json(breach, { status: 201 });
  } catch (err) {
    const status = err instanceof BreachError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
