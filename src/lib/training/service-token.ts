// Service-token auth for machine-to-machine training ingest (Phase 2). The
// training platform presents a bearer token; we resolve it to an AR-SCOPED
// tenant so it can only ever write its own firm's completions, and only on the
// ingest route (a token is not a session, so it unlocks nothing else).
//
// Invariant 6 (secrets server-side): the raw token never lives in the codebase
// or the browser bundle. Only SHA-256 HASHES are configured (TRAINING_INGEST_
// TOKENS); the raw token is held by the caller and in the secrets vault. We hash
// the presented token and match hashes, so a config leak cannot be replayed.
import { createHash } from "node:crypto";
import type { TenantContext } from "../db";

export const TRAINING_INGEST_CAPABILITY = "training:ingest";

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw.trim()).digest("hex").toLowerCase();
}

/**
 * Format one TRAINING_INGEST_TOKENS registry entry for a raw token. This is
 * the write side of parseTokenRegistry — scripts/mint-training-token.ts uses
 * it so the stored format can never drift from what the parser accepts.
 */
export function formatRegistryEntry(arId: string, rawToken: string): string {
  return `${arId}:${hashToken(rawToken)}`;
}

export interface ServiceTokenGrant {
  arId: string;
  capability: string;
}

export type TokenRegistry = Map<string, ServiceTokenGrant>;

/**
 * Parse the TRAINING_INGEST_TOKENS env into a hash→grant registry. Format is a
 * comma/whitespace-separated list of `arId:sha256hex` entries. An empty/missing
 * value yields an empty registry, so bearer auth fails closed until tokens are
 * provisioned.
 */
export function parseTokenRegistry(spec: string | undefined | null): TokenRegistry {
  const registry: TokenRegistry = new Map();
  if (!spec) return registry;
  for (const entry of spec.split(/[\s,]+/).filter(Boolean)) {
    const idx = entry.indexOf(":");
    if (idx <= 0) continue;
    const arId = entry.slice(0, idx).trim();
    const hash = entry.slice(idx + 1).trim().toLowerCase();
    if (!arId || !/^[0-9a-f]{64}$/.test(hash)) continue;
    registry.set(hash, { arId, capability: TRAINING_INGEST_CAPABILITY });
  }
  return registry;
}

/**
 * Resolve an Authorization header to the AR the presented token is scoped to,
 * or null if there is no valid `training:ingest` token. Fail-closed: any parse
 * failure, unknown hash, or wrong capability returns null.
 */
export function resolveServiceToken(
  authorizationHeader: string | null | undefined,
  registry: TokenRegistry,
): { arId: string } | null {
  if (!authorizationHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!m) return null;
  const grant = registry.get(hashToken(m[1]));
  if (!grant || grant.capability !== TRAINING_INGEST_CAPABILITY) return null;
  return { arId: grant.arId };
}

/**
 * Resolve a bearer token straight to an AR-scoped tenant context for the ingest
 * route, or null. The machine principal is deliberately modelled as an AR so RLS
 * and the service's firm-scope check confine it to exactly one firm.
 */
export function serviceTokenTenant(
  authorizationHeader: string | null | undefined,
  registry: TokenRegistry,
): TenantContext | null {
  const grant = resolveServiceToken(authorizationHeader, registry);
  return grant ? { role: "AR", arId: grant.arId } : null;
}
