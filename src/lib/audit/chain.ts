// Tamper-evident audit chaining (Invariant 4). Each audit_event stores the hash
// of the row before it, so the log is a linked chain: altering or removing any
// row breaks every hash after it, and the break is detectable without needing a
// second copy of the data.
//
// This is DETECTION, not prevention — prevention is the append-only grant (no
// UPDATE/DELETE on audit_event) plus RLS. The chain is what shows the grant was
// never circumvented out-of-band (e.g. by a superuser, or a doctored restore).
//
// Pure and DB-free so it can be unit-tested and reused by both the writer and
// the verifier.
import { createHash } from "node:crypto";

/**
 * Field separator and null sentinel, written as explicit escapes: they are
 * control characters, and a literal one pasted into source would be invisible —
 * silently changing every hash. Neither can occur in the values we hash.
 */
const SEP = String.fromCharCode(31); // U+001F unit separator
const NULL_SENTINEL = String.fromCharCode(0) + "null";

/** The canonical fields covered by a row's hash. */
export interface AuditChainRow {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  /** ISO timestamp exactly as stored. */
  ts: string;
  /** Hash of the preceding row; null for the genesis row (or a pre-chain row). */
  hashPrev: string | null;
}

/**
 * Hash of one row, covering its own hashPrev so the linkage itself is sealed.
 * Fields are separator-delimited because plain concatenation is ambiguous —
 * ("ab","c") and ("a","bc") would otherwise hash identically — and null is a
 * distinct sentinel so it cannot collide with an empty string.
 */
export function auditRowHash(row: AuditChainRow): string {
  const part = (v: string | null) => (v === null ? NULL_SENTINEL : v);
  const canonical = [
    row.id,
    row.actor,
    row.action,
    row.entity,
    part(row.entityId),
    row.ts,
    part(row.hashPrev),
  ].join(SEP);
  return createHash("sha256").update(canonical).digest("hex");
}

export interface ChainVerification {
  ok: boolean;
  /** Rows whose link was checked against the preceding row. */
  checked: number;
  /** Rows with no verifiable link — they pre-date chaining, or open the window. */
  unchained: number;
  /** The first row whose stored hashPrev does not match the recomputed value. */
  brokenAt?: { id: string; index: number; expected: string; found: string };
}

/**
 * Walk an ordered run of audit rows (OLDEST FIRST) and confirm each row's
 * hashPrev matches the recomputed hash of the row before it.
 *
 * A row with hashPrev === null counts as `unchained` rather than passing: rows
 * written before chaining existed genuinely cannot be verified, and calling them
 * "ok" would overstate the guarantee. Only a row that claims a link and gets it
 * wrong is a break.
 */
export function verifyAuditChain(rowsOldestFirst: readonly AuditChainRow[]): ChainVerification {
  let checked = 0;
  let unchained = 0;

  for (let i = 0; i < rowsOldestFirst.length; i++) {
    const row = rowsOldestFirst[i];
    if (row.hashPrev === null) {
      unchained++;
      continue;
    }
    if (i === 0) {
      // The first row of this window links to a row outside it, which we cannot
      // recompute here — unverifiable in this window, not broken.
      unchained++;
      continue;
    }
    const expected = auditRowHash(rowsOldestFirst[i - 1]);
    if (row.hashPrev !== expected) {
      return {
        ok: false,
        checked,
        unchained,
        brokenAt: { id: row.id, index: i, expected, found: row.hashPrev },
      };
    }
    checked++;
  }

  return { ok: true, checked, unchained };
}
