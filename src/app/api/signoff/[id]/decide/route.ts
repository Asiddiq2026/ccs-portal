import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { decideSignOff, SignOffError } from "@/lib/signoff/service";
import { signOffPrismaDeps } from "@/lib/signoff/prisma-adapter";

export const runtime = "nodejs";

/**
 * POST /api/signoff/:id/decide — the human decision gate. An SMF either signs a
 * PENDING draft off (materialising it as a FINAL register row) or returns it
 * with a rationale. This is the ONLY path that produces a FINAL row (Invariants
 * 1 & 3). Body: { decision: "SIGN_OFF" | "RETURN", notes?: string }.
 */
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

  let body: { decision?: unknown; notes?: unknown } = {};
  try {
    body = (await req.json()) as { decision?: unknown; notes?: unknown };
  } catch {
    body = {};
  }

  if (body.decision !== "SIGN_OFF" && body.decision !== "RETURN") {
    return NextResponse.json(
      { error: 'decision must be "SIGN_OFF" or "RETURN"' },
      { status: 400 },
    );
  }

  try {
    const result = await decideSignOff(signOffPrismaDeps, tenant, {
      draftId: params.id,
      decision: body.decision,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const status = err instanceof SignOffError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
