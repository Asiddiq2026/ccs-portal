// POST /api/cf30/nil — an AR files a NIL quarterly return (CF30). This does NOT
// write a FINAL register row: it creates a PENDING sign-off draft targeting
// cf30_return, routed to Razlin's SMF sign-off queue (Invariants 1 & 3). The
// quarter + due date are computed by the deterministic engine server-side.
// Body (JSON): { referenceDate?, declaredBy, arId? }. referenceDate defaults to
// the previous quarter-end; arId is forced to the caller's firm for an AR.
// Errors: 401 · 400 · 403. Success: 201 { id, quarter, dueDate, status }.
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { prismaStore, prismaAudit } from "@/lib/tools/prisma-adapters";
import { fileNilReturn, Cf30Error } from "@/lib/cf30/service";

export const runtime = "nodejs";

/** Last calendar day of the quarter immediately before `now` (UTC). */
function previousQuarterEndRef(now: Date = new Date()): string {
  const qStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  // Day 0 of the current quarter's first month = last day of the prior quarter.
  const d = new Date(Date.UTC(now.getUTCFullYear(), qStartMonth, 0));
  return d.toISOString().slice(0, 10);
}

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
    // An empty/invalid body is fine — we default referenceDate below.
  }

  const referenceRaw = typeof body.referenceDate === "string" ? body.referenceDate.trim() : "";
  const referenceDate = referenceRaw || previousQuarterEndRef();
  const declaredBy = typeof body.declaredBy === "string" ? body.declaredBy.trim() : "";

  let arId: string;
  if (tenant.role === "AR") {
    arId = tenant.arId;
  } else {
    arId = typeof body.arId === "string" ? body.arId.trim() : "";
    if (!arId) {
      return NextResponse.json({ error: "arId is required for operator filings" }, { status: 400 });
    }
  }

  try {
    const result = await fileNilReturn(
      { store: prismaStore, audit: prismaAudit },
      tenant,
      { arId, referenceDate, declaredBy },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const status = err instanceof Cf30Error ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
