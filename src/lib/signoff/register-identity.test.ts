import { describe, it, expect } from "vitest";
import {
  REGISTER_IDENTITY,
  REGISTER_SCHEMAS,
  draftIdentityKey,
  identityWhere,
  type MaterialisableRegister,
} from "./register-schemas";

describe("REGISTER_IDENTITY", () => {
  it("declares an identity for every materialisable register", () => {
    // A register added to REGISTER_SCHEMAS without an identity decision would
    // silently fall back to append — which duplicated person_cpd rows and broke
    // appointed_rep sign-off with a unique-constraint 500.
    for (const register of Object.keys(REGISTER_SCHEMAS) as MaterialisableRegister[]) {
      expect(register in REGISTER_IDENTITY).toBe(true);
    }
  });

  it("treats current-position registers as replace, not append", () => {
    expect(REGISTER_IDENTITY.appointed_rep).toEqual(["arId"]);
    expect(REGISTER_IDENTITY.person_cpd).toEqual(["arId", "person"]);
    expect(REGISTER_IDENTITY.cf30_return).toEqual(["arId", "quarter"]);
    expect(REGISTER_IDENTITY.data_breach).toEqual(["ref"]);
  });

  it("treats risk_score as an event stream — assessment history is the point", () => {
    expect(REGISTER_IDENTITY.risk_score).toBeNull();
  });
});

describe("identityWhere", () => {
  it("builds the lookup for a current-position register", () => {
    expect(
      identityWhere("person_cpd", { arId: "ar_six", person: "Rob Tull", cpdHours: 9 }),
    ).toEqual({ arId: "ar_six", person: "Rob Tull" });

    expect(identityWhere("appointed_rep", { arId: "ar_six", frn: "900001" })).toEqual({
      arId: "ar_six",
    });

    expect(identityWhere("cf30_return", { arId: "ar_six", quarter: "2026-Q1" })).toEqual({
      arId: "ar_six",
      quarter: "2026-Q1",
    });

    expect(identityWhere("data_breach", { ref: "BR-1001", severity: "HIGH" })).toEqual({
      ref: "BR-1001",
    });
  });

  it("returns null for an event-stream register so the sign-off appends", () => {
    expect(identityWhere("risk_score", { arId: "ar_six", total: 9 })).toBeNull();
  });

  it("fails closed to append when an identity field is missing or null", () => {
    // A partial identity would match the wrong row — or every row in the firm.
    expect(identityWhere("person_cpd", { arId: "ar_six" })).toBeNull();
    expect(identityWhere("person_cpd", { arId: "ar_six", person: null })).toBeNull();
    expect(identityWhere("data_breach", {})).toBeNull();
  });

  it("ignores non-identity payload fields", () => {
    const where = identityWhere("person_cpd", {
      arId: "ar_six",
      person: "Rob Tull",
      cpdHours: 8,
      strikes: 3,
      certExpiry: "2026-12-31",
    });
    expect(where).toEqual({ arId: "ar_six", person: "Rob Tull" });
  });
});

describe("draftIdentityKey (queue superseding)", () => {
  it("two drafts updating the same register row share a key", () => {
    const a = draftIdentityKey("person_cpd", { arId: "ar_six", person: "Rob Tull", cpdHours: 4 });
    const b = draftIdentityKey("person_cpd", { arId: "ar_six", person: "Rob Tull", cpdHours: 9 });
    expect(a).not.toBeNull();
    expect(a).toBe(b); // differing non-identity fields still supersede
  });

  it("different identities never collide", () => {
    const a = draftIdentityKey("person_cpd", { arId: "ar_six", person: "Rob Tull" });
    const b = draftIdentityKey("person_cpd", { arId: "ar_six", person: "Craig Nelson" });
    const c = draftIdentityKey("person_cpd", { arId: "ar_drakestar", person: "Rob Tull" });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("event streams, artifacts and incomplete identities never supersede", () => {
    // risk_score history is the point — every assessment is its own fact.
    expect(draftIdentityKey("risk_score", { arId: "ar_six", total: 9 })).toBeNull();
    // Artifacts / unknown registers are not materialisable.
    expect(draftIdentityKey("evidence_pack", { docs: [] })).toBeNull();
    // Missing identity field fails closed to append (keep both drafts).
    expect(draftIdentityKey("person_cpd", { arId: "ar_six" })).toBeNull();
    expect(draftIdentityKey("person_cpd", null)).toBeNull();
  });
});
