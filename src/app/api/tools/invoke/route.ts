import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { prismaToolDeps } from "@/lib/tools/prisma-adapters";
import { handleInvoke } from "./handler";

// Prisma + Auth.js need the Node runtime (not edge).
export const runtime = "nodejs";

/**
 * POST /api/tools/invoke — the only HTTP way to reach the tool layer.
 *
 * Chain: session -> requireTenant (RLS context, fail-closed) -> handleInvoke ->
 * gateway (whitelist + withheld + reserved) -> tool (Zod in/out) -> Prisma
 * under withTenant() (RLS). No write bypasses this path.
 */
export async function POST(req: Request): Promise<Response> {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    // Not signed in, or a malformed session (e.g. AR without arId) — fail closed.
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { status, body: resBody } = await handleInvoke(tenant, prismaToolDeps, body);
  return NextResponse.json(resBody, { status });
}
