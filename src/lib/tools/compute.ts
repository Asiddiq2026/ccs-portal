import { z } from "zod";
import type { Tool } from "./types";
import {
  quarterEnd,
  cf30DueDate,
  escalationLadder,
  riskBand,
  cpdStrike,
  creditedCpdHours,
} from "../engine";

/**
 * compute_dates — COMPUTE. Pure, deterministic date arithmetic backed by the
 * ported engine (Invariant 7: the model never does date maths). No DB access.
 */
export const computeDates: Tool = {
  name: "compute_dates",
  kind: "COMPUTE",
  input: z.object({
    quarterEndDate: z.string(),
  }),
  output: z.object({
    quarterEnd: z.string(),
    cf30Due: z.string(),
    ladder: z.array(
      z.object({ step: z.string(), date: z.string(), action: z.string() }),
    ),
  }),
  async run(input) {
    const qe = quarterEnd(input.quarterEndDate);
    const due = cf30DueDate(qe);
    return { quarterEnd: qe, cf30Due: due, ladder: escalationLadder(due) };
  },
};

/**
 * compute_thresholds — COMPUTE. Pure risk-band + CPD-strike calculators backed
 * by the engine. No DB access.
 */
export const computeThresholds: Tool = {
  name: "compute_thresholds",
  kind: "COMPUTE",
  input: z.object({
    riskFactors: z.array(z.number()).optional(),
    cpd: z
      .object({
        // Either give hours directly, or give raw completions and let the engine
        // credit them (Invariant 7 — the model never sums hours itself).
        hours: z.number().optional(),
        completions: z
          .array(z.object({ moduleId: z.string(), passed: z.boolean() }))
          .optional(),
        required: z.number().optional(),
        monthsLeft: z.number(),
      })
      .optional(),
  }),
  output: z.object({
    risk: z
      .object({ total: z.number(), band: z.string(), cadence: z.string() })
      .optional(),
    cpdHours: z.number().optional(),
    cpdStrike: z.number().optional(),
  }),
  async run(input) {
    let cpdHours: number | undefined;
    let strike: number | undefined;
    if (input.cpd) {
      const hours = input.cpd.completions
        ? creditedCpdHours(input.cpd.completions)
        : (input.cpd.hours ?? 0);
      cpdHours = hours;
      strike = cpdStrike({
        hours,
        required: input.cpd.required,
        monthsLeft: input.cpd.monthsLeft,
      });
    }
    return {
      risk: input.riskFactors ? riskBand(input.riskFactors) : undefined,
      cpdHours,
      cpdStrike: strike,
    };
  },
};
