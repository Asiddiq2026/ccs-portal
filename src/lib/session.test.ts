import { describe, it, expect } from "vitest";
import { sessionToTenant } from "./session";

// Pure derivation of the RLS tenant context from a session user. These are the
// fail-closed guarantees the whole tenancy model rests on (Invariants 5 & 9).
describe("sessionToTenant", () => {
  it("throws on an unauthenticated / role-less session", () => {
    expect(() => sessionToTenant(null)).toThrow(/unauthenticated/);
    expect(() => sessionToTenant(undefined)).toThrow(/unauthenticated/);
    expect(() => sessionToTenant({})).toThrow(/unauthenticated/);
  });

  it("throws when an AR user carries no arId (firm scope is mandatory)", () => {
    expect(() => sessionToTenant({ role: "AR" })).toThrow(/AR user has no arId/);
    expect(() => sessionToTenant({ role: "AR", arId: "" })).toThrow(
      /AR user has no arId/,
    );
    expect(() => sessionToTenant({ role: "AR", arId: null })).toThrow(
      /AR user has no arId/,
    );
  });

  it("derives a firm-scoped context for a valid AR user", () => {
    expect(sessionToTenant({ role: "AR", arId: "ar_six" })).toEqual({
      role: "AR",
      arId: "ar_six",
    });
  });

  it("derives a network-scoped context for COMPLIANCE / SMF (no arId)", () => {
    expect(sessionToTenant({ role: "COMPLIANCE" })).toEqual({
      role: "COMPLIANCE",
      arId: "",
    });
    expect(sessionToTenant({ role: "SMF", arId: null })).toEqual({
      role: "SMF",
      arId: "",
    });
  });
});
