import { auth } from "@/auth";
import type { TenantContext, TenantRole } from "@/lib/db";

/**
 * Pure: derive the RLS tenant context from a session user. AR sessions MUST
 * carry an arId (they are firm-scoped); COMPLIANCE/SMF are network-scoped.
 * Throws on an unauthenticated or malformed session — fail closed.
 */
export function sessionToTenant(
  user: { role?: TenantRole | null; arId?: string | null } | null | undefined,
): TenantContext {
  if (!user?.role) throw new Error("unauthenticated: no role on session");
  if (user.role === "AR" && !user.arId) {
    throw new Error("invalid session: AR user has no arId");
  }
  return { role: user.role, arId: user.arId ?? "" };
}

/** Server-side: current tenant context, or throws if not signed in. */
export async function requireTenant(): Promise<TenantContext> {
  const session = await auth();
  return sessionToTenant(session?.user);
}
