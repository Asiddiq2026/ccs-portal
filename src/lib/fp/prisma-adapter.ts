// Production wiring for the FP channel: FpStore backed by Prisma, each call
// scoped through withTenant() so RLS binds the caller's firm. The service never
// imports Prisma — only this adapter does. Audit reuses the tool-layer writer.
import { withTenant } from "../db";
import { prismaAudit } from "../tools/prisma-adapters";
import type { AuditWriter } from "../tools/types";
import type { BlobStore } from "./storage";
import type { CobsItem, FpDeps, FpRecord, FpStore, FpType } from "./service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): FpRecord {
  return {
    id: row.id,
    arId: row.arId,
    ref: row.ref,
    type: row.type as FpType,
    title: row.title,
    audience: row.audience,
    cobs: (row.cobs ?? []) as CobsItem[],
    status: row.status,
    submittedBy: row.submittedBy,
    reviewedBy: row.reviewedBy ?? null,
    reviewerNotes: row.reviewerNotes ?? null,
  };
}

export const fpPrismaStore: FpStore = {
  async createPromotion(input, tenant) {
    return withTenant(tenant, async (tx) => {
      // Human-facing ref. NOTE: count()+1 can race under high concurrency; the
      // unique constraint on `ref` makes a collision fail loudly rather than
      // silently duplicate. Replace with a Postgres sequence at scale.
      const n = await tx.financialPromotion.count();
      const ref = `FP-${String(1000 + n + 1).padStart(4, "0")}`;
      const row = await tx.financialPromotion.create({
        data: {
          arId: input.arId,
          ref,
          type: input.type,
          title: input.title,
          audience: input.audience,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cobs: input.cobs as any,
          submittedBy: input.submittedBy,
          status: "PENDING",
        },
      });
      return toRecord(row);
    });
  },

  async addDocuments(promotionId, arId, docs, tenant) {
    await withTenant(tenant, async (tx) => {
      await tx.promotionDocument.createMany({
        data: docs.map((d) => ({
          arId,
          promotionId,
          name: d.name,
          size: d.size,
          sha256: d.sha256,
          blobUrl: d.blobUrl,
        })),
      });
    });
  },

  async getPromotion(id, tenant) {
    return withTenant(tenant, async (tx) => {
      const row = await tx.financialPromotion.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    });
  },

  async setDecision(id, decision, tenant) {
    return withTenant(tenant, async (tx) => {
      const row = await tx.financialPromotion.update({
        where: { id },
        data: {
          status: decision.status,
          reviewedBy: decision.reviewedBy,
          reviewerNotes: decision.reviewerNotes,
          decidedAt: new Date(),
        },
      });
      return toRecord(row);
    });
  },
};

/** Assemble the production FP dependency bundle around a chosen BlobStore. */
export function fpPrismaDeps(blob: BlobStore): FpDeps {
  const audit: AuditWriter = prismaAudit;
  return { store: fpPrismaStore, audit, blob };
}
