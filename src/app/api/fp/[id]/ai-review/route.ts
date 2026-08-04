import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { prismaAudit } from "@/lib/tools/prisma-adapters";
import { fpPrismaStore } from "@/lib/fp/prisma-adapter";
import { reviewPromotion } from "@/lib/fp/ai-review";
import { createAnthropicClient } from "@/lib/fp/anthropic-client";
import { prismaMeter } from "@/lib/metering/prisma-adapter";
import { parseMonthlyBudget } from "@/lib/metering/service";

// Anthropic call + Prisma need the Node runtime, and the API key stays here —
// never in the client bundle.
export const runtime = "nodejs";

/**
 * POST /api/fp/:id/ai-review — server-side COBS 4 / MAR compliance review.
 * The verdict is advisory only; the SMF sign-off remains the sole authority.
 * Errors: 401 unauthenticated · 404 unknown promotion · 502 model failure ·
 * 503 no API key.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const fp = await fpPrismaStore.getPromotion(params.id, tenant);
  if (!fp) {
    return NextResponse.json({ error: "no such promotion" }, { status: 404 });
  }

  try {
    const result = await reviewPromotion(
      {
        model: createAnthropicClient(),
        audit: prismaAudit,
        meter: prismaMeter,
        budget: parseMonthlyBudget(),
      },
      tenant,
      fp,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    // MissingApiKeyError (503) / ModelCallError (502) carry a status; anything
    // else fails closed to "conduct manual review".
    const status = (err as { status?: number }).status ?? 502;
    return NextResponse.json(
      { error: "AI review unavailable — conduct manual review.", detail: (err as Error).message },
      { status },
    );
  }
}
