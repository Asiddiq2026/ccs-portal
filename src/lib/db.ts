import { PrismaClient } from "@prisma/client";

// Singleton Prisma client (avoids exhausting connections on hot reload in dev).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type TenantRole = "AR" | "COMPLIANCE" | "SMF";

export interface TenantContext {
  role: TenantRole;
  // The caller's firm. Required for AR; COMPLIANCE/SMF are network-scoped but a
  // value is still set so writes carry the acting firm where relevant.
  arId: string;
}

/**
 * Runs `fn` inside a transaction that carries the RLS request context. Every
 * DB access from the API layer MUST go through here so row-level security is
 * scoped to the caller. Uses set_config(..., is_local => true) so the GUCs are
 * bound to this transaction only, and passes values as bind parameters (no SQL
 * injection surface).
 *
 * The GUCs are read by the policies in prisma/rls.sql:
 *   app.role  -> COMPLIANCE/SMF see all rows; AR restricted to its arId
 *   app.ar_id -> the caller's firm
 */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.role', ${ctx.role}, true)`;
    await tx.$executeRaw`SELECT set_config('app.ar_id', ${ctx.arId}, true)`;
    return fn(tx);
  });
}
