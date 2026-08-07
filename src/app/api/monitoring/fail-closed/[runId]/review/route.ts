// POST /api/monitoring/fail-closed/:runId/review — record an operator's
// disposition of a fail-closed (OPERATOR REVIEW) agent run. Operator-only; a
// rationale is required. Append-only: one review per run. This is what lets the
// "open fail-closed" signal reach zero instead of only growing.
// Body (JSON): { rationale }. Errors: 400 · 401 · 403 · 404 · 409. Success: 201.
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { failClosedPrismaDeps } from "@/lib/failclosed/prisma-adapter";
import { recordFailClosedReview, FailClosedError } from "@/lib/failclosed/service";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { runId: string } },
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

  const rationale = typeof body.rationale === "string" ? body.rationale : "";

  try {
    const review = await recordFailClosedReview(failClosedPrismaDeps, tenant, {
      runId: params.runId,
      rationale,
    });
    return NextResponse.json(
      { runId: review.runId, reviewer: review.reviewer, ts: review.ts.toISOString() },
      { status: 201 },
    );
  } catch (err) {
    const status = err instanceof FailClosedError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
