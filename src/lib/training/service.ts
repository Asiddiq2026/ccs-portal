// Training-completion ingest + CPD roll-up. This is the bridge between the
// external training platform and the person_cpd oversight register.
//
// Two responsibilities, deliberately separated along the golden rule:
//   1. recordCompletions — writes FACTUAL evidence (append-only) into
//      training_completion. A completion is a fact, not a regulated decision,
//      so it is written directly (like an audit row), never via the sign-off
//      queue. It carries NO CPD-hour figure the caller can assert.
//   2. cpdStatus — DERIVES credited hours + three-strike level from those facts
//      using the deterministic engine (Invariant 7). This is what agent-cpd-tracker
//      turns into a PENDING person_cpd draft for SMF sign-off — this module never
//      writes person_cpd itself.
//
// DB-free: depends only on injected interfaces so it unit-tests with in-memory
// stubs. The Prisma-backed TrainingStore lives in ./prisma-adapter.
import { z } from "zod";
import type { AuditWriter, Tenant } from "../tools/types";
import { creditedCpdHours, cpdStrike } from "../engine";

/** Domain error carrying an HTTP-ish status so the route can map it directly. */
export class TrainingError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TrainingError";
  }
}

// One passed/attempted module for one person. `completedAt` arrives as an ISO
// string over JSON and is coerced; unknown keys are stripped so the external
// platform can never smuggle extra columns (e.g. a self-asserted hours field).
const completionSchema = z
  .object({
    person: z.string().min(1),
    moduleId: z.string().min(1),
    moduleTitle: z.string().min(1),
    quarter: z.string().min(1),
    score: z.coerce.number().int().nonnegative(),
    outOf: z.coerce.number().int().positive(),
    pct: z.coerce.number().int().min(0).max(100),
    passed: z.boolean(),
    certificateId: z.string().optional(),
    completedAt: z.coerce.date(),
  })
  .strip();

export const trainingBatchSchema = z.object({
  arId: z.string().min(1),
  completions: z.array(completionSchema).min(1),
});

export type CompletionInput = z.infer<typeof completionSchema>;

export interface TrainingCompletionRow extends CompletionInput {
  arId: string;
  source: string;
}

export interface TrainingStore {
  /** Append one completion (INSERT only — the table has no UPDATE/DELETE grant). */
  appendCompletion(row: TrainingCompletionRow, tenant: Tenant): Promise<{ id: string }>;
  /** All completions for a firm (optionally one person), scoped by RLS. */
  listCompletions(
    filter: { arId: string; person?: string },
    tenant: Tenant,
  ): Promise<Array<{ person: string; moduleId: string; passed: boolean }>>;
}

export interface TrainingDeps {
  store: TrainingStore;
  audit: AuditWriter;
}

function actorOf(tenant: Tenant): string {
  return `${tenant.role}:${tenant.arId || "network"}`;
}

// An AR may only ingest for its own firm; COMPLIANCE/SMF may ingest for a named
// firm (the operator-import path). Fail-closed on a cross-firm attempt.
function assertFirmScope(tenant: Tenant, arId: string): void {
  if (tenant.role === "AR" && tenant.arId !== arId) {
    throw new TrainingError(403, "forbidden: cannot record training for another firm");
  }
}

export interface RecordResult {
  arId: string;
  recorded: number;
  ids: string[];
}

/**
 * Record a batch of training completions as append-only evidence. Writes one
 * training_completion row per item and a single append-only audit event for the
 * batch. Never touches person_cpd.
 */
export async function recordCompletions(
  deps: TrainingDeps,
  tenant: Tenant,
  input: unknown,
): Promise<RecordResult> {
  const parsed = trainingBatchSchema.safeParse(input);
  if (!parsed.success) {
    throw new TrainingError(
      400,
      `invalid training batch: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
    );
  }
  const { arId, completions } = parsed.data;
  assertFirmScope(tenant, arId);

  const ids: string[] = [];
  for (const c of completions) {
    const { id } = await deps.store.appendCompletion(
      { ...c, arId, source: "training_platform" },
      tenant,
    );
    ids.push(id);
  }

  await deps.audit.append(
    {
      actor: actorOf(tenant),
      action: "TRAINING COMPLETIONS RECORDED",
      entity: "training_completion",
      entityId: arId,
    },
    tenant,
  );

  return { arId, recorded: ids.length, ids };
}

export interface CpdStatus {
  arId: string;
  person: string;
  cpdHours: number;
  required: number;
  monthsLeft: number;
  strikes: number;
}

/**
 * Deterministic CPD roll-up for one person: credited hours from completions and
 * the resulting three-strike level. This is the payload basis agent-cpd-tracker
 * drafts into person_cpd — the arithmetic lives here, never in the model.
 */
export async function cpdStatus(
  deps: TrainingDeps,
  tenant: Tenant,
  args: { arId: string; person: string; monthsLeft: number; required?: number },
): Promise<CpdStatus> {
  assertFirmScope(tenant, args.arId);
  const required = args.required ?? 35;
  const rows = await deps.store.listCompletions({ arId: args.arId, person: args.person }, tenant);
  const cpdHours = creditedCpdHours(rows);
  const strikes = cpdStrike({ hours: cpdHours, required, monthsLeft: args.monthsLeft });
  return { arId: args.arId, person: args.person, cpdHours, required, monthsLeft: args.monthsLeft, strikes };
}
