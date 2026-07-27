// The single place an audit_event row is written. Everything that appends to
// the audit trail must go through here, or the hash chain develops holes and
// verification degrades to "unverifiable" (Invariant 4).
//
// Chaining requires reading the current tail and writing the next row without
// another writer slipping in between. audit_event has no UPDATE grant, so
// SELECT ... FOR UPDATE is not available; instead we take a transaction-scoped
// Postgres advisory lock, which serialises appends without needing any
// privilege on the row.
import { auditRowHash, type AuditChainRow } from "./chain";

/** Arbitrary but fixed key — the "audit append" lane. */
const AUDIT_LOCK_KEY = 4820147;

export interface AuditAppendInput {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId?: string | null;
}

/**
 * Append one audit row inside an existing transaction, linked to the current
 * tail. `ts` is set explicitly (not left to the column default) so the value
 * that is hashed is exactly the value stored.
 */
export async function appendAuditTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  input: AuditAppendInput,
): Promise<{ id: string; hashPrev: string | null }> {
  // Serialise concurrent appends for the lifetime of this transaction, so two
  // writers cannot both chain onto the same predecessor and fork the log.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY}::bigint)`;

  const prev = await tx.auditEvent.findFirst({
    orderBy: [{ ts: "desc" }, { id: "desc" }],
    select: { id: true, actor: true, action: true, entity: true, entityId: true, ts: true, hashPrev: true },
  });

  const hashPrev = prev
    ? auditRowHash({
        id: prev.id,
        actor: prev.actor,
        action: prev.action,
        entity: prev.entity,
        entityId: prev.entityId ?? null,
        ts: prev.ts.toISOString(),
        hashPrev: prev.hashPrev ?? null,
      })
    : null; // genesis row

  // createMany issues INSERT without RETURNING: audit_event's SELECT policy is
  // operator-only, and RETURNING is gated by it, so a non-operator writer (an
  // AR, or an AR-scoped service token) could not read back its own row.
  await tx.auditEvent.createMany({
    data: [
      {
        id: input.id,
        actor: input.actor,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        ts: new Date(),
        hashPrev,
      },
    ],
  });

  return { id: input.id, hashPrev };
}

/** Re-hydrate a Prisma audit row into the pure chain shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toChainRow(row: any): AuditChainRow {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId ?? null,
    ts: row.ts.toISOString(),
    hashPrev: row.hashPrev ?? null,
  };
}
