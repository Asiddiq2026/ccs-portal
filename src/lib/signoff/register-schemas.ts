// Phase 9 — the FINAL-materialisation contract. A PENDING sign-off draft holds
// an arbitrary payload (write_register_entry accepts `Record<string, unknown>`).
// Before that payload can become a FINAL register row on SMF sign-off, it MUST
// validate against the target register's schema. A payload that fails cannot be
// materialised — the sign-off fails closed and the draft is returned (Invariant
// 9). Dates arrive as ISO strings in JSON, so we coerce; unknown keys are
// stripped so a draft can never smuggle extra columns into a register.
import { z } from "zod";

const RiskBand = z.enum(["GREEN", "AMBER", "RED"]);

// cf30_return — the only register with a PENDING/FINAL lifecycle; sign-off
// materialises it as FINAL regardless of what the draft claimed.
const cf30Return = z
  .object({
    arId: z.string().min(1),
    quarter: z.string().min(1),
    dueDate: z.coerce.date(),
    receivedAt: z.coerce.date().nullish(),
    exceptions: z.coerce.number().int().nonnegative().default(0),
  })
  .strip()
  .transform((d) => ({ ...d, status: "FINAL" as const }));

const riskScore = z
  .object({
    arId: z.string().min(1),
    factors: z.array(z.number().int()),
    total: z.coerce.number().int(),
    band: RiskBand,
    cadence: z.string().min(1),
    computedAt: z.coerce.date(),
  })
  .strip();

const personCpd = z
  .object({
    arId: z.string().min(1),
    person: z.string().min(1),
    cpdHours: z.coerce.number().int().nonnegative().default(0),
    required: z.coerce.number().int().positive().default(35),
    strikes: z.coerce.number().int().nonnegative().default(0),
    certExpiry: z.coerce.date(),
  })
  .strip();

const dataBreach = z
  .object({
    arId: z.string().min(1),
    ref: z.string().min(1),
    detectedAt: z.coerce.date(),
    art33Clock: z.coerce.date(),
    status: z.enum(["PENDING", "REPORTED", "CLOSED"]).default("PENDING"),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  })
  .strip();

const appointedRep = z
  .object({
    arId: z.string().min(1),
    frn: z.string().min(1),
    legalName: z.string().min(1),
    status: z.enum(["ONBOARDING", "ACTIVE", "SUSPENDED", "TERMINATED"]).default("ONBOARDING"),
    onboardedAt: z.coerce.date(),
    riskBand: RiskBand.nullish(),
  })
  .strip();

/**
 * Registers materialisable via the generic sign-off queue. `financial_promotion`
 * is intentionally absent — it has its own submission/decision channel
 * (decidePromotion), so a draft targeting it is refused at sign-off.
 */
export const REGISTER_SCHEMAS = {
  cf30_return: cf30Return,
  risk_score: riskScore,
  person_cpd: personCpd,
  data_breach: dataBreach,
  appointed_rep: appointedRep,
} as const;

export type MaterialisableRegister = keyof typeof REGISTER_SCHEMAS;

export function isMaterialisable(register: string): register is MaterialisableRegister {
  return register in REGISTER_SCHEMAS;
}

export interface ValidatedPayload {
  ok: boolean;
  data?: Record<string, unknown>;
  issues?: string[];
}

/** Validate a draft payload against its target register. Fail-closed on mismatch. */
export function validateRegisterPayload(register: string, payload: unknown): ValidatedPayload {
  if (!isMaterialisable(register)) {
    return {
      ok: false,
      issues: [`register "${register}" is not materialisable via sign-off`],
    };
  }
  const parsed = REGISTER_SCHEMAS[register].safeParse(payload);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return { ok: true, data: parsed.data as Record<string, unknown> };
}
