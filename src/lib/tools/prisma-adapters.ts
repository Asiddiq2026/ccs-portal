// Production wiring: RegisterStore + AuditWriter backed by Prisma, each call
// scoped through withTenant() so RLS binds the caller's app.role / app.ar_id.
// The tools themselves never import Prisma — only these adapters do.
import { randomUUID } from "node:crypto";
import { withTenant } from "../db";
import { appendAuditTx } from "../audit/append";
import type { AuditWriter, RegisterStore, ToolDeps } from "./types";
import { stubFeedScreener } from "./feeds";

// Register table name -> Prisma delegate name.
const DELEGATE: Record<string, string> = {
  appointed_rep: "appointedRep",
  cf30_return: "cf30Return",
  financial_promotion: "financialPromotion",
  risk_score: "riskScore",
  data_breach: "dataBreach",
  person_cpd: "personCpd",
  training_completion: "trainingCompletion",
  training_certificate: "trainingCertificate",
  audit_event: "auditEvent",
  agent_run: "agentRun",
};

export const prismaStore: RegisterStore = {
  async query(table, filter, tenant) {
    const delegateName = DELEGATE[table];
    if (!delegateName) throw new Error(`query_database: unknown table ${table}`);
    return withTenant(tenant, async (tx) => {
      // Dynamic delegate access; the table name is validated by the tool's Zod
      // enum and the whitelist above before we get here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegate = (tx as any)[delegateName];
      return delegate.findMany({ where: filter ?? {} });
    });
  },

  async createPendingDraft(input, tenant) {
    return withTenant(tenant, async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = await (tx as any).signOffItem.create({
        data: {
          arId: input.arId,
          register: input.register,
          payload: input.payload,
          summary: input.summary,
          agentId: input.agentId,
          createdBy: input.createdBy,
          status: "PENDING",
        },
      });
      return { id: item.id as string, status: "PENDING" as const };
    });
  },

  async createPendingArtifact(input, tenant) {
    return withTenant(tenant, async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = await (tx as any).signOffItem.create({
        data: {
          arId: input.arId,
          // Artifacts reuse the register string column (no migration).
          register: input.artifactType,
          payload: input.payload,
          summary: input.summary,
          agentId: input.agentId,
          createdBy: input.createdBy,
          status: "PENDING",
        },
      });
      return { id: item.id as string, status: "PENDING" as const };
    });
  },

  async getDraft(id, tenant) {
    return withTenant(tenant, async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = await (tx as any).signOffItem.findUnique({ where: { id } });
      return item
        ? { id: item.id as string, status: item.status as string, arId: item.arId as string }
        : null;
    });
  },
};

export const prismaAudit: AuditWriter = {
  async append(e, tenant) {
    return withTenant(tenant, async (tx) => {
      // Delegates to the single chained writer so every audit row links to its
      // predecessor (Invariant 4 tamper evidence). See lib/audit/append.ts for
      // why it locks and why it avoids RETURNING.
      const { id } = await appendAuditTx(tx, {
        id: `evt_${randomUUID()}`,
        actor: e.actor,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId,
      });
      return { id };
    });
  },
};

/** The production dependency bundle passed to ToolContext.deps. */
export const prismaToolDeps: ToolDeps = {
  store: prismaStore,
  audit: prismaAudit,
  // Fail-closed until a real adverse-media provider is wired (see feeds.ts).
  feeds: stubFeedScreener,
};
