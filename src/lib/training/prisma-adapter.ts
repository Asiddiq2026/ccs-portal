// Prisma-backed TrainingStore. Every call runs through withTenant() so RLS
// binds the caller's app.role / app.ar_id. training_completion is append-only
// (no UPDATE/DELETE grant on ccs_app — see prisma/rls.sql), so this adapter only
// ever creates and reads.
import { withTenant } from "../db";
import type { TrainingStore } from "./service";

export const prismaTrainingStore: TrainingStore = {
  async appendCompletion(row, tenant) {
    return withTenant(tenant, async (tx) => {
      const created = await tx.trainingCompletion.create({
        data: {
          arId: row.arId,
          person: row.person,
          moduleId: row.moduleId,
          moduleTitle: row.moduleTitle,
          quarter: row.quarter,
          score: row.score,
          outOf: row.outOf,
          pct: row.pct,
          passed: row.passed,
          certificateId: row.certificateId,
          completedAt: row.completedAt,
          source: row.source,
        },
      });
      return { id: created.id };
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
