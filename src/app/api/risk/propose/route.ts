// POST /api/risk/propose — propose a new AR risk assessment. The caller supplies
// only the five factor scores (1-3); the engine derives total, band and cadence,
// so a band can never be asserted by hand (Invariant 7). Creates a PENDING
// sign-off draft targeting risk_score — it does not write the register.
// Body (JSON): { arId, factors: number[5] }. Errors: 401 · 403 · 400. 201 on success.
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { riskPrismaDeps } from "@/lib/risk/prisma-adapter";
import { proposeRiskScore, RiskError } from "@/lib/risk/service";

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

  const arId = typeof body.arId === "string" ? body.arId : "";
  const factors = Array.isArray(body.factors) ? body.factors.map((n) => Number(n)) : [];

  try {
    const result = await proposeRiskScore(riskPrismaDeps, tenant, { arId, factors });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const status = err instanceof RiskError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
