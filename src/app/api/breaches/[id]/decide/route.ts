// POST /api/breaches/:id/decide — SMF-only transition out of PENDING.
// REPORT records that the SMF has notified the ICO; CLOSE records a reasoned
// decision that no notification is due (rationale required). The platform never
// files anything itself — this records a human action (Invariants 1 & 3).
// Body (JSON): { decision: "REPORT" | "CLOSE", notes? }.
// Errors: 401 · 403 · 400 · 404 · 409. Success: 200 { ...breach }.
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { breachPrismaDeps } from "@/lib/breach/prisma-adapter";
import { decideBreach, BreachError } from "@/lib/breach/service";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
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

  const decision = body.decision === "CLOSE" ? "CLOSE" : body.decision === "REPORT" ? "REPORT" : null;
  if (!decision) {
    return NextResponse.json({ error: 'decision must be "REPORT" or "CLOSE"' }, { status: 400 });
  }

  try {
    const updated = await decideBreach(breachPrismaDeps, tenant, {
      id: params.id,
      decision,
      actor: `${tenant.role}:${tenant.arId || "network"}`,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });
    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    const status = err instanceof BreachError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
