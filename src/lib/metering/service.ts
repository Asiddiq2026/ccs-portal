// Model-token metering — the COGS control (docs/COMMERCIALISATION.md step 3).
// Every path that spends Anthropic tokens (agent runs, FP AI reviews) records
// its usage in the append-only model_usage ledger, and a monthly budget gate
// refuses further model calls once the cap is reached.
//
// The budget is an OPS control, not a safety invariant, so its default differs
// from the platform's usual fail-closed posture and that is deliberate:
// MODEL_TOKEN_BUDGET_MONTHLY unset means UNMETERED-but-VISIBLE (the monitoring
// dashboard shows spend and warns that no cap is set) rather than refusing all
// model work out of the box. Set the cap in any deployment that pays for
// tokens. When set, enforcement is hard: a run/review that would exceed it is
// refused BEFORE the model is called, and the refusal names the numbers.
import type { Tenant } from "../tools/types";

export type UsageSource = "agent_run" | "fp_ai_review";

export interface UsageRecord {
  source: UsageSource;
  tokens: number;
  arId?: string | null;
}

export interface MeterStore {
  /** Append one usage row (the ledger is append-only). */
  record(usage: UsageRecord, tenant: Tenant): Promise<void>;
  /** Total tokens recorded since the start of the current UTC month. */
  monthToDate(now: Date, tenant: Tenant): Promise<number>;
}

/** First instant of the current UTC month — the budget window boundary. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Parse MODEL_TOKEN_BUDGET_MONTHLY. A positive integer enables enforcement;
 * unset/blank/zero/garbage means no cap (visible on monitoring as unmetered).
 */
export function parseMonthlyBudget(env: Record<string, string | undefined> = process.env): number | null {
  const raw = env.MODEL_TOKEN_BUDGET_MONTHLY?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export interface BudgetDecision {
  allowed: boolean;
  spent: number;
  budget: number | null;
  /** Tokens left this month; null when no budget is set. */
  remaining: number | null;
}

/** The gate: spending at or beyond the cap refuses the next model call. */
export function checkBudget(spent: number, budget: number | null): BudgetDecision {
  if (budget === null) return { allowed: true, spent, budget: null, remaining: null };
  const remaining = Math.max(0, budget - spent);
  return { allowed: spent < budget, spent, budget, remaining };
}

/** Thrown by model paths when the monthly budget is exhausted (maps to 429). */
export class BudgetExhaustedError extends Error {
  readonly status = 429 as const;
  constructor(decision: BudgetDecision) {
    super(
      `monthly model-token budget exhausted (${decision.spent} of ${decision.budget} used) — ` +
        "refused before any model call; raise MODEL_TOKEN_BUDGET_MONTHLY or wait for the new month",
    );
    this.name = "BudgetExhaustedError";
  }
}
