import { describe, it, expect } from "vitest";
import {
  monthStartUtc,
  parseMonthlyBudget,
  checkBudget,
  BudgetExhaustedError,
} from "./service";

describe("monthStartUtc", () => {
  it("returns the first UTC instant of the month", () => {
    expect(monthStartUtc(new Date("2026-08-04T15:30:00.000Z")).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
    expect(monthStartUtc(new Date("2026-01-01T00:00:00.000Z")).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});

describe("parseMonthlyBudget", () => {
  it("accepts a positive integer", () => {
    expect(parseMonthlyBudget({ MODEL_TOKEN_BUDGET_MONTHLY: "500000" })).toBe(500000);
  });

  it("treats unset/blank/zero/garbage as no cap", () => {
    expect(parseMonthlyBudget({})).toBeNull();
    expect(parseMonthlyBudget({ MODEL_TOKEN_BUDGET_MONTHLY: "" })).toBeNull();
    expect(parseMonthlyBudget({ MODEL_TOKEN_BUDGET_MONTHLY: "0" })).toBeNull();
    expect(parseMonthlyBudget({ MODEL_TOKEN_BUDGET_MONTHLY: "-5" })).toBeNull();
    expect(parseMonthlyBudget({ MODEL_TOKEN_BUDGET_MONTHLY: "lots" })).toBeNull();
    expect(parseMonthlyBudget({ MODEL_TOKEN_BUDGET_MONTHLY: "1.5" })).toBeNull();
  });
});

describe("checkBudget", () => {
  it("always allows when no budget is set", () => {
    expect(checkBudget(9_999_999, null)).toMatchObject({ allowed: true, remaining: null });
  });

  it("allows under the cap and reports remaining", () => {
    expect(checkBudget(400, 1000)).toMatchObject({ allowed: true, remaining: 600 });
  });

  it("refuses AT the cap, not just beyond it", () => {
    expect(checkBudget(1000, 1000).allowed).toBe(false);
    expect(checkBudget(1001, 1000)).toMatchObject({ allowed: false, remaining: 0 });
  });
});

describe("BudgetExhaustedError", () => {
  it("carries 429 and names the numbers", () => {
    const err = new BudgetExhaustedError(checkBudget(1200, 1000));
    expect(err.status).toBe(429);
    expect(err.message).toContain("1200 of 1000");
  });
});
