// POST /api/cpd/propose — propose bringing a person's person_cpd row into line
// with their training evidence. This creates a PENDING sign-off draft; it does
// NOT write the register. Only an audited SMF sign-off materialises it
// (Invariants 1 & 3). Operators only.
// Body (JSON): { arId, person }. Errors: 401 · 403 · 404 · 409. Success: 201.
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { cpdPrismaDeps } from "@/lib/cpd/prisma-adapter";
import { proposeCpdUpdate, CpdError } from "@/lib/cpd/service";

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

  const arId = typeof body.arId === "string" ? body.arId.trim() : "";
  const person = typeof body.person === "string" ? body.person.trim() : "";
  if (!arId || !person) {
    return NextResponse.json({ error: "arId and person are required" }, { status: 400 });
  }

  try {
    const result = await proposeCpdUpdate(cpdPrismaDeps, tenant, { arId, person });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const status = err instanceof CpdError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
