import { describe, it, expect } from "vitest";
import { auditRowHash, verifyAuditChain, type AuditChainRow } from "./chain";

/** Build a correctly-chained run of rows, oldest first. */
function chainOf(n: number): AuditChainRow[] {
  const rows: AuditChainRow[] = [];
  for (let i = 0; i < n; i++) {
    const row: AuditChainRow = {
      id: `evt_${i}`,
      actor: "SMF:network",
      action: i === 0 ? "SEED" : "SIGNED OFF",
      entity: "cf30_return",
      entityId: `ent_${i}`,
      ts: `2026-07-0${i + 1}T00:00:00.000Z`,
      hashPrev: i === 0 ? null : auditRowHash(rows[i - 1]),
    };
    rows.push(row);
  }
  return rows;
}

describe("auditRowHash", () => {
  it("is deterministic and 64-hex", () => {
    const [row] = chainOf(1);
    expect(auditRowHash(row)).toMatch(/^[0-9a-f]{64}$/);
    expect(auditRowHash(row)).toBe(auditRowHash({ ...row }));
  });

  it("changes when any covered field changes", () => {
    const [row] = chainOf(1);
    const base = auditRowHash(row);
    expect(auditRowHash({ ...row, actor: "AR:ar_six" })).not.toBe(base);
    expect(auditRowHash({ ...row, action: "SIGNED OFF" })).not.toBe(base);
    expect(auditRowHash({ ...row, entity: "person_cpd" })).not.toBe(base);
    expect(auditRowHash({ ...row, entityId: "other" })).not.toBe(base);
    expect(auditRowHash({ ...row, ts: "2026-07-02T00:00:00.000Z" })).not.toBe(base);
    expect(auditRowHash({ ...row, hashPrev: "deadbeef" })).not.toBe(base);
  });

  it("distinguishes a null field from an empty string", () => {
    const [row] = chainOf(1);
    expect(auditRowHash({ ...row, entityId: null })).not.toBe(
      auditRowHash({ ...row, entityId: "" }),
    );
  });

  it("is unambiguous across field boundaries", () => {
    // Without a separator, ("ab","c") and ("a","bc") would collide.
    const a: AuditChainRow = {
      id: "x", actor: "ab", action: "c", entity: "e", entityId: null,
      ts: "2026-07-01T00:00:00.000Z", hashPrev: null,
    };
    const b: AuditChainRow = { ...a, actor: "a", action: "bc" };
    expect(auditRowHash(a)).not.toBe(auditRowHash(b));
  });
});

describe("verifyAuditChain", () => {
  it("accepts an intact chain", () => {
    const res = verifyAuditChain(chainOf(5));
    expect(res.ok).toBe(true);
    expect(res.checked).toBe(4); // 5 rows -> 4 verifiable links
    expect(res.unchained).toBe(1); // the genesis row
    expect(res.brokenAt).toBeUndefined();
  });

  it("detects a tampered row — the break surfaces at the row AFTER the edit", () => {
    const rows = chainOf(5);
    // Someone rewrites who performed event 2.
    rows[2] = { ...rows[2], actor: "SMF:forged" };
    const res = verifyAuditChain(rows);
    expect(res.ok).toBe(false);
    expect(res.brokenAt?.index).toBe(3);
    expect(res.brokenAt?.id).toBe("evt_3");
  });

  it("detects a deleted row", () => {
    const rows = chainOf(5);
    rows.splice(2, 1); // remove evt_2
    const res = verifyAuditChain(rows);
    expect(res.ok).toBe(false);
  });

  it("detects a row inserted into the middle", () => {
    const rows = chainOf(4);
    rows.splice(2, 0, {
      id: "evt_fake", actor: "SMF:network", action: "SIGNED OFF", entity: "cf30_return",
      entityId: "ent_fake", ts: "2026-07-02T12:00:00.000Z", hashPrev: "0".repeat(64),
    });
    const res = verifyAuditChain(rows).ok;
    expect(res).toBe(false);
  });

  it("counts pre-chain rows as unchained rather than passing them", () => {
    // Legacy rows written before chaining existed carry no hashPrev.
    const legacy: AuditChainRow[] = [
      { id: "old1", actor: "system", action: "SEED", entity: "appointed_rep", entityId: null, ts: "2026-01-01T00:00:00.000Z", hashPrev: null },
      { id: "old2", actor: "system", action: "SEED", entity: "appointed_rep", entityId: null, ts: "2026-01-02T00:00:00.000Z", hashPrev: null },
    ];
    const res = verifyAuditChain(legacy);
    expect(res.ok).toBe(true);
    expect(res.checked).toBe(0);
    expect(res.unchained).toBe(2);
  });

  it("treats the first row of a window as unverifiable, not broken", () => {
    // A window that starts mid-chain links to a row we cannot see.
    const full = chainOf(5);
    const window = full.slice(2);
    const res = verifyAuditChain(window);
    expect(res.ok).toBe(true);
    expect(res.unchained).toBe(1);
    expect(res.checked).toBe(2);
  });

  it("handles an empty log", () => {
    expect(verifyAuditChain([])).toMatchObject({ ok: true, checked: 0, unchained: 0 });
  });
});
