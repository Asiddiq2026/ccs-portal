// Prisma-backed TrainingStore. Every call runs through withTenant() so RLS
// binds the caller's app.role / app.ar_id. Both tables are append-only (no
// UPDATE/DELETE grant on ccs_app — see prisma/rls.sql), so this adapter only
// ever creates and reads, and uses createMany (no RETURNING) — audit_event's
// SELECT policy is operator-only, so a RETURNING insert would fail for an
// AR-scoped writer (same reason as prismaAudit).
import { randomUUID } from "node:crypto";
import { withTenant } from "../db";
import type { TrainingStore } from "./service";

export const prismaTrainingStore: TrainingStore = {
  async recordBatch({ rows, audit }, tenant) {
    // One transaction: all completions + the audit entry. All-or-nothing.
    return withTenant(tenant, async (tx) => {
      const withIds = rows.map((r) => ({ id: `tc_${randomUUID()}`, ...r }));
      await tx.trainingCompletion.createMany({
        data: withIds.map((r) => ({
          id: r.id,
          arId: r.arId,
          person: r.person,
          moduleId: r.moduleId,
          moduleTitle: r.moduleTitle,
          quarter: r.quarter,
          score: r.score,
          outOf: r.outOf,
          pct: r.pct,
          passed: r.passed,
          certificateId: r.certificateId,
          completedAt: r.completedAt,
          source: r.source,
        })),
      });
      await tx.auditEvent.createMany({
        data: [
          {
            id: `evt_${randomUUID()}`,
            actor: audit.actor,
            action: audit.action,
            entity: audit.entity,
            entityId: audit.entityId,
          },
        ],
      });
      return { ids: withIds.map((r) => r.id) };
    });
  },

  async listCompletions(filter, tenant) {
    return withTenant(tenant, async (tx) => {
      const rows = await tx.trainingCompletion.findMany({
        where: { arId: filter.arId, ...(filter.person ? { person: filter.person } : {}) },
        select: { person: true, moduleId: true, passed: true },
      });
      return rows;
    });
  },
};
