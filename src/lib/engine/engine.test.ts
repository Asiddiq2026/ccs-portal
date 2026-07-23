import { describe, it, expect } from "vitest";
import {
  isBusinessDay,
  addBusinessDays,
  quarterEnd,
  cf30DueDate,
  riskBand,
  cpdStrike,
  retentionEnd,
  art33Deadline,
} from "./index";
import { BANK_HOLIDAYS } from "./bank-holidays";

// The 18 reference cases from deterministic-engine.js runTests(), ported 1:1.
describe("CCS deterministic engine — reference cases", () => {
  it("Good Friday 2026 is not a business day", () => {
    expect(isBusinessDay("2026-04-03")).toBe(false);
  });
  it("Tue 07 Apr 2026 is a business day", () => {
    expect(isBusinessDay("2026-04-07")).toBe(true);
  });
  it("Quarter end of 14 Feb 2026 → 31 Mar 2026", () => {
    expect(quarterEnd("2026-02-14")).toBe("2026-03-31");
  });
  it("Q1-2026 due date spans Easter → 16 Apr 2026", () => {
    expect(cf30DueDate("2026-03-31")).toBe("2026-04-16");
  });
  it("Q4-2026 due date spans New Year → 15 Jan 2027", () => {
    expect(cf30DueDate("2026-12-31")).toBe("2027-01-15");
  });
  it("T-5BD before 16 Apr 2026 → 09 Apr", () => {
    expect(addBusinessDays("2026-04-16", -5)).toBe("2026-04-09");
  });
  it("T+20BD after 16 Apr skips May Day → 15 May", () => {
    expect(addBusinessDays("2026-04-16", 20)).toBe("2026-05-15");
  });
  it("Risk 5 → GREEN", () => {
    expect(riskBand([1, 1, 1, 1, 1]).band).toBe("GREEN");
  });
  it("Risk 8 → AMBER", () => {
    expect(riskBand([2, 2, 2, 1, 1]).band).toBe("AMBER");
  });
  it("Risk 11 → AMBER (upper bound)", () => {
    expect(riskBand([3, 3, 2, 2, 1]).band).toBe("AMBER");
  });
  it("Risk 12 → RED (lower bound)", () => {
    expect(riskBand([3, 3, 2, 2, 2]).band).toBe("RED");
  });
  it("CPD 22/35h, 3 months left → strike 1", () => {
    expect(cpdStrike({ hours: 22, monthsLeft: 3 })).toBe(1);
  });
  it("CPD 34/35h, 1 month left → no strike", () => {
    expect(cpdStrike({ hours: 34, monthsLeft: 1 })).toBe(0);
  });
  it("CPD 20/35h past deadline → strike 3", () => {
    expect(cpdStrike({ hours: 20, monthsLeft: 0 })).toBe(3);
  });
  it("Audit retention 6 yr", () => {
    expect(retentionEnd("2026-04-16", "audit")).toBe("2032-04-16");
  });
  it("Agent-run retention 7 yr", () => {
    expect(retentionEnd("2026-04-16", "agent_run")).toBe("2033-04-16");
  });
  it("AR records retained indefinitely", () => {
    expect(retentionEnd("2026-04-16", "ar_record")).toBe("indefinite");
  });
  it("Art 33: 72h clock", () => {
    expect(art33Deadline("2026-04-11T08:30:00Z")).toBe("2026-04-14T08:30:00.000Z");
  });
});

// Coverage for the 2028-2030 bank-holiday extension (Invariant 7).
describe("extended bank holidays 2028-2030", () => {
  it("New Year 2028 substitute Mon 03 Jan is a holiday; Sat 01 Jan is not a business day", () => {
    expect(BANK_HOLIDAYS.has("2028-01-03")).toBe(true);
    expect(isBusinessDay("2028-01-03")).toBe(false);
    expect(isBusinessDay("2028-01-01")).toBe(false); // Saturday
  });
  it("Good Friday / Easter Monday 2029 are holidays", () => {
    expect(isBusinessDay("2029-03-30")).toBe(false);
    expect(isBusinessDay("2029-04-02")).toBe(false);
  });
  it("Christmas + Boxing Day 2030 are holidays", () => {
    expect(isBusinessDay("2030-12-25")).toBe(false);
    expect(isBusinessDay("2030-12-26")).toBe(false);
  });
  it("addBusinessDays skips the 2028 Spring bank holiday", () => {
    // Fri 26 May 2028 + 1BD skips Mon 29 May (Spring BH) → Tue 30 May.
    expect(addBusinessDays("2028-05-26", 1)).toBe("2028-05-30");
  });
});
