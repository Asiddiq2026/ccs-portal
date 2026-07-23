import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { fpPrismaDeps } from "@/lib/fp/prisma-adapter";
import { createInMemoryBlobStore } from "@/lib/fp/storage";
import { decidePromotion, FpError } from "@/lib/fp/service";

export const runtime = "nodejs";

/**
 * POST /api/fp/:id/decide — SMF Adopt/Reject, the sole authority to move a
 * promotion out of PENDING. REJECT requires reviewer notes (surfaced to the AR).
 * The blob store is irrelevant to a decision, so a throwaway one satisfies the
 * dependency bundle. Errors: 401 · 403 (non-SMF) · 400 (reject w/o notes) ·
 * 404 · 409 (already decided).
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
  if (body.decision !== "ADOPT" && body.decision !== "REJECT") {
    return NextResponse.json({ error: 'decision must be "ADOPT" or "REJECT"' }, { status: 400 });
  }

  try {
    const updated = await decidePromotion(fpPrismaDeps(createInMemoryBlobStore()), tenant, {
      id: params.id,
      decision: body.decision,
      actor: `${tenant.role}:${tenant.arId || "network"}`,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });
    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    const status = err instanceof FpError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
