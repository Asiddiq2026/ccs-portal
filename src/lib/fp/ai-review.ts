// Phase 5 — server-side AI compliance review of a financial promotion. The
// verdict is ADVISORY ONLY: final authority is the SMF sign-off (Invariant:
// agents/AI draft, humans decide). This module is pure w.r.t. I/O — it depends
// on an injected ModelClient + AuditWriter, so it is testable with no network
// and no API key. The prompt wording is preserved verbatim from the design
// reference (COBS 4 / MAR 7 / s.21 FSMA framing).
import type { AuditWriter, Tenant } from "../tools/types";
import type { FpRecord } from "./service";
import { PRINCIPAL, principalLegalWithFrn } from "../principal";
import { BudgetExhaustedError, checkBudget, type MeterStore } from "../metering/service";

export type Verdict =
  | "APPROVE"
  | "APPROVE WITH CONDITIONS"
  | "REFER FOR FURTHER REVIEW"
  | "REJECT";

export interface ModelCompletion {
  text: string;
  /** Total tokens (input + output) the call consumed — feeds the usage ledger. */
  tokens: number;
}

export interface ModelClient {
  /** Single-shot completion: prompt in, assistant text + token usage out. */
  complete(prompt: string): Promise<ModelCompletion>;
}

export interface AiReviewDeps {
  model: ModelClient;
  audit: AuditWriter;
  /** Optional metering: record usage + enforce the monthly budget when set. */
  meter?: MeterStore;
  budget?: number | null;
}

export interface AiReviewResult {
  ref: string;
  verdict: Verdict;
  analysis: string;
  /** Fixed advisory disclaimer — CCS is not FCA authorised; SMF decides. */
  advisory: string;
}

const ADVISORY =
  "AI analysis is advisory only and prepared by CCS (not FCA authorised). " +
  `Final approval authority rests with ${PRINCIPAL.legalName}'s SMF16/17 holder as the ` +
  "FCA-authorised principal firm.";

/** Build the review prompt. Framing + instruction are verbatim from the reference. */
export function buildReviewPrompt(fp: FpRecord): string {
  const checklist = fp.cobs
    .map((c) => `- [${c.checked ? "x" : " "}] ${c.label}`)
    .join("\n");
  return `You are a senior compliance analyst at CCS (Comprehensive Compliance Solutions), a compliance consultancy that is not itself FCA authorised. You are reviewing a financial promotion on behalf of your client, ${principalLegalWithFrn()}, the FCA-authorised principal firm responsible for approving the promotion under s.21 FSMA and COBS 4. The originating firm is an appointed representative of ${PRINCIPAL.shortName}, and all promotions are restricted to per se professional clients (COBS 3.5) and eligible counterparties (COBS 3.6) — no retail.

Promotion Reference: ${fp.ref}
Title: ${fp.title}
Appointed Representative: ${fp.arId}
Type: ${fp.type}
Intended Audience: ${fp.audience}
COBS 4 checklist (self-certified by the AR):
${checklist}

Conduct a structured compliance review covering: COBS 4.2.1R (fair, clear and not misleading); COBS 4.5 (risk warnings); COBS 4.6 (past performance, if applicable); MAR 7 / COBS 12 (research independence and conflicts, if research); s.21 FSMA and Art 19 FPO (exempt communication pathway, with ${PRINCIPAL.shortName} as approver); and audience restriction to professionals/ECPs only. For each relevant area give a brief finding of one to two sentences. Then give an overall verdict: APPROVE, APPROVE WITH CONDITIONS, REFER FOR FURTHER REVIEW, or REJECT. Keep the whole response under 320 words, plain compliance prose, no markdown headers or bullet symbols.`;
}

/**
 * Map the model's prose to a canonical verdict. Precedence matches the
 * reference: REJECT > APPROVE WITH CONDITIONS > APPROVE, else REFER. The more
 * severe verdict wins so a conditional/negative reading is never softened.
 */
export function parseVerdict(text: string): Verdict {
  const t = text.toUpperCase();
  if (t.includes("REJECT")) return "REJECT";
  if (t.includes("APPROVE WITH CONDITIONS")) return "APPROVE WITH CONDITIONS";
  if (t.includes("APPROVE")) return "APPROVE";
  return "REFER FOR FURTHER REVIEW";
}

/**
 * Run the review. Writes an AI REVIEW audit row up front (the request is logged
 * whether or not the model call later succeeds), calls the model, then returns a
 * structured, advisory verdict. Model/transport errors propagate to the caller,
 * which fails closed to manual review.
 */
export async function reviewPromotion(
  deps: AiReviewDeps,
  tenant: Tenant,
  fp: FpRecord,
): Promise<AiReviewResult> {
  // Budget gate BEFORE any model call (429 when exhausted). Metering is
  // optional so DB-free tests and unmetered deployments still work.
  if (deps.meter && deps.budget != null) {
    const decision = checkBudget(await deps.meter.monthToDate(new Date(), tenant), deps.budget);
    if (!decision.allowed) throw new BudgetExhaustedError(decision);
  }

  await deps.audit.append(
    {
      actor: "ai-review",
      action: "AI REVIEW",
      entity: "financial_promotion",
      entityId: fp.id,
    },
    tenant,
  );

  const completion = await deps.model.complete(buildReviewPrompt(fp));
  if (deps.meter && completion.tokens > 0) {
    await deps.meter.record(
      { source: "fp_ai_review", tokens: completion.tokens, arId: fp.arId },
      tenant,
    );
  }
  return {
    ref: fp.ref,
    verdict: parseVerdict(completion.text),
    analysis: completion.text,
    advisory: ADVISORY,
  };
}
