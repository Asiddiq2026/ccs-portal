// Type surface for the API tool layer — the single writeable path (Invariant 1).
// Tools depend only on the injected `deps` interfaces below, never on Prisma
// directly, so the gateway + tools are unit-testable without a database.
import type { z } from "zod";

export type TenantRole = "AR" | "COMPLIANCE" | "SMF";

export interface Tenant {
  role: TenantRole;
  arId: string;
}

// The six per-AR (tenant-isolated) register tables. write_register_entry may
// only target these; the network append-only tables are written by other paths.
export const PER_AR_REGISTERS = [
  "appointed_rep",
  "cf30_return",
  "financial_promotion",
  "risk_score",
  "data_breach",
  "person_cpd",
] as const;
export type PerArRegister = (typeof PER_AR_REGISTERS)[number];

// Network-scoped, internal-only reads (COMPLIANCE/SMF).
export const NETWORK_READ_TABLES = ["audit_event", "agent_run"] as const;

// ---- Injected dependencies -------------------------------------------------

export interface RegisterStore {
  /** Scoped read. RLS applies the caller's arId automatically via withTenant. */
  query(
    table: string,
    filter: Record<string, unknown> | undefined,
    tenant: Tenant,
  ): Promise<Record<string, unknown>[]>;

  /** Creates a PENDING sign-off draft. NEVER writes a FINAL register row. */
  createPendingDraft(
    input: {
      register: PerArRegister;
      arId: string;
      payload: Record<string, unknown>;
      summary: string;
      agentId?: string;
      createdBy: string;
    },
    tenant: Tenant,
  ): Promise<{ id: string; status: "PENDING" }>;

  /**
   * Creates a PENDING sign-off ARTIFACT — a non-register pack (review_pack /
   * evidence_pack). Stored as a sign_off_item whose `register` column holds the
   * artifact type. Approving it never writes a FINAL register row; it is an
   * operator acknowledgement (see src/lib/signoff/artifacts.ts).
   */
  createPendingArtifact(
    input: {
      artifactType: string;
      arId: string;
      payload: Record<string, unknown>;
      summary: string;
      agentId?: string;
      createdBy: string;
    },
    tenant: Tenant,
  ): Promise<{ id: string; status: "PENDING" }>;

  getDraft(
    id: string,
    tenant: Tenant,
  ): Promise<{ id: string; status: string; arId: string } | null>;
}

export interface AuditWriter {
  /** Append-only insert into audit_event. */
  append(
    e: { actor: string; action: string; entity: string; entityId?: string },
    tenant: Tenant,
  ): Promise<{ id: string }>;
}

/** A single adverse-media / sanctions hit returned by an external screener. */
export interface FeedHit {
  subject: string;
  source: string;
  /** Provider-supplied confidence 0..100 (thresholded in code, not by a model). */
  matchScore: number;
  summary: string;
}

export interface FeedScreenResult {
  /** false when the provider errored or is unavailable — screen_feeds fails closed. */
  ok: boolean;
  provider: string;
  hits: FeedHit[];
}

/**
 * External adverse-media / sanctions screener for screen_feeds. Injected so the
 * tool never imports a network client directly and stays unit-testable. When no
 * screener is wired (or it returns ok:false), screen_feeds fails closed.
 */
export interface FeedScreener {
  screen(subjects: string[], tenant: Tenant): Promise<FeedScreenResult>;
}

export interface ToolDeps {
  store: RegisterStore;
  audit: AuditWriter;
  /** Optional — screen_feeds fails closed (OPERATOR_REVIEW) when absent. */
  feeds?: FeedScreener;
}

export interface ToolContext {
  /** The calling agent id (or user id) — used for whitelist + audit. */
  agentId: string;
  tenant: Tenant;
  deps: ToolDeps;
}

export type ToolKind = "READ" | "WRITE" | "EGRESS" | "COMPUTE";

export interface Tool<
  I extends z.ZodTypeAny = z.ZodTypeAny,
  O extends z.ZodTypeAny = z.ZodTypeAny,
> {
  name: string;
  kind: ToolKind;
  input: I;
  output: O;
  // Method form (bivariant) so concrete tools slot into a Tool registry.
  run(input: z.infer<I>, ctx: ToolContext): Promise<z.infer<O>>;
}

// ---- Errors ----------------------------------------------------------------

/** 403 — the call is forbidden (withheld tool, or not on the agent whitelist). */
export class ToolDeniedError extends Error {
  readonly status = 403 as const;
  constructor(
    readonly toolName: string,
    readonly reason: string,
  ) {
    super(`403 tool denied: ${toolName} — ${reason}`);
    this.name = "ToolDeniedError";
  }
}

/** 501 — declared on a whitelist but not implemented until a later phase. */
export class ToolUnavailableError extends Error {
  readonly status = 501 as const;
  constructor(readonly toolName: string) {
    super(`501 tool not implemented: ${toolName} (reserved for a later phase)`);
    this.name = "ToolUnavailableError";
  }
}
