// Walk the ENTIRE audit log oldest-first and verify the hash chain
// (Invariant 4 tamper evidence). /infra re-verifies only the newest 500 rows on
// page load; this is the full-log check an auditor or the quarterly SMF review
// runs:
//
//   npm run verify:audit
//
// Exit 0 = intact (every row that claims a link has a correct one).
// Exit 1 = BROKEN — the first bad link is reported with both hashes.
//
// Rows with hashPrev NULL are reported as unchained, never as passing: the
// genesis row is expected to be one; any OTHER unchained row post-dates the
// chain writer and deserves scrutiny (all writers route through appendAuditTx).
//
// What a break means: prevention is the append-only grant + RLS; the chain
// detects those being circumvented OUT-OF-BAND (a superuser UPDATE, a doctored
// restore). This script is how that detection is actually exercised.
//
// Honest limit: the chain detects alteration that PERSISTS. A tamperer who
// perfectly restores the original bytes leaves no trace — inherent to any hash
// chain without external anchoring. The mitigation is procedural: record the
// tip (the newest row's hash, printed below) somewhere the database cannot
// reach, e.g. in each quarterly SMF review pack; a later run whose history
// doesn't reproduce that tip proves rewriting even if the chain self-verifies.
import { prisma, withTenant } from "../src/lib/db";
import { auditRowHash, type AuditChainRow } from "../src/lib/audit/chain";

const BATCH = 1000;

async function main() {
  let prev: AuditChainRow | null = null;
  let cursor: { ts: Date; id: string } | null = null;
  let total = 0;
  let checked = 0;
  let unchained = 0;
  const unchainedIds: string[] = [];

  for (;;) {
    // Keyset pagination, oldest first, under an operator read context (the
    // audit SELECT policy is operator-only).
    const rows = await withTenant({ role: "COMPLIANCE", arId: "" }, (tx) =>
      tx.auditEvent.findMany({
        where: cursor
          ? {
              OR: [
                { ts: { gt: cursor.ts } },
                { ts: cursor.ts, id: { gt: cursor.id } },
              ],
            }
          : {},
        orderBy: [{ ts: "asc" }, { id: "asc" }],
        take: BATCH,
      }),
    );
    if (rows.length === 0) break;

    for (const r of rows) {
      total++;
      const row: AuditChainRow = {
        id: r.id,
        actor: r.actor,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId ?? null,
        ts: r.ts.toISOString(),
        hashPrev: r.hashPrev ?? null,
      };

      if (row.hashPrev === null) {
        unchained++;
        unchainedIds.push(row.id);
      } else if (prev === null) {
        // A chained row with no predecessor at all — the head of the log has
        // been deleted or reordered.
        console.error(`BROKEN at row 1 (${row.id}): claims a predecessor but the log has none before it.`);
        process.exit(1);
      } else {
        const expected = auditRowHash(prev);
        if (row.hashPrev !== expected) {
          console.error(
            `BROKEN at row ${total} (${row.id}, action "${row.action}"):\n` +
              `  stored   hashPrev ${row.hashPrev}\n` +
              `  expected          ${expected}\n` +
              `The row before it (${prev.id}, action "${prev.action}") has been altered, removed, or reordered.`,
          );
          process.exit(1);
        }
        checked++;
      }
      prev = row;
    }
    const last = rows[rows.length - 1];
    cursor = { ts: last.ts, id: last.id };
  }

  console.log(`audit chain INTACT: ${total} rows · ${checked} links verified · ${unchained} unchained`);
  if (prev) {
    // The anchor value: record this outside the database (e.g. the quarterly
    // SMF review pack). A future run must reproduce it from history.
    console.log(`tip (hash of newest row ${prev.id}): ${auditRowHash(prev)}`);
  }
  if (unchained > 1) {
    // One genesis row is expected; more means pre-chain history or a writer
    // bypassing appendAuditTx. Surfaced, not failed — the links still hold.
    console.log(
      `note: ${unchained} rows carry no link (expected: exactly 1 genesis). Unchained ids: ${unchainedIds.join(", ")}`,
    );
  }
}

main()
  .catch((e) => {
    console.error("verify-audit-chain failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
