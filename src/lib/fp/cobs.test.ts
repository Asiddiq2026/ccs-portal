import { describe, it, expect } from "vitest";
import { FP_TYPES, isFpType, parseCobs, COBS_CHECKLIST } from "./cobs";

describe("isFpType", () => {
  it("accepts every canonical type and rejects others", () => {
    for (const t of FP_TYPES) expect(isFpType(t)).toBe(true);
    expect(isFpType("teaser")).toBe(false); // case-sensitive
    expect(isFpType("BROCHURE")).toBe(false);
    expect(isFpType("")).toBe(false);
  });
});

describe("parseCobs", () => {
  it("parses a valid JSON checklist", () => {
    const raw = JSON.stringify([
      { label: "a", checked: true },
      { label: "b", checked: false },
    ]);
    expect(parseCobs(raw)).toEqual([
      { label: "a", checked: true },
      { label: "b", checked: false },
    ]);
  });

  it("round-trips the canonical checklist", () => {
    const raw = JSON.stringify(COBS_CHECKLIST.map((label) => ({ label, checked: true })));
    const parsed = parseCobs(raw);
    expect(parsed).toHaveLength(COBS_CHECKLIST.length);
    expect(parsed?.every((c) => c.checked)).toBe(true);
  });

  it("returns null for empty, missing, or non-array input", () => {
    expect(parseCobs(null)).toBeNull();
    expect(parseCobs(undefined)).toBeNull();
    expect(parseCobs("")).toBeNull();
    expect(parseCobs("[]")).toBeNull();
    expect(parseCobs("{}")).toBeNull();
    expect(parseCobs("not json")).toBeNull();
  });

  it("returns null when any item is malformed", () => {
    expect(parseCobs(JSON.stringify([{ label: "a" }]))).toBeNull(); // no checked
    expect(parseCobs(JSON.stringify([{ checked: true }]))).toBeNull(); // no label
    expect(parseCobs(JSON.stringify([{ label: "", checked: true }]))).toBeNull(); // blank label
    expect(parseCobs(JSON.stringify([{ label: "a", checked: "yes" }]))).toBeNull(); // wrong type
    expect(parseCobs(JSON.stringify(["a", "b"]))).toBeNull(); // primitives
  });
});
