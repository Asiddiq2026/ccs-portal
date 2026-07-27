// Production wiring for the CPD channel. Reads person_cpd through withTenant()
// (RLS scopes the firm) and reuses the existing training + register + audit
// adapters, so the whole evidence -> draft path shares one writeable surface.
import { withTenant } from "../db";
import { prismaAudit, prismaStore } from "../tools/prisma-adapters";
import { prismaTrainingStore } from "../training/prisma-adapter";
import type { CpdDeps, CpdRegisterRow, CpdStore } from "./service";

export const cpdPrismaStore: CpdStore = {
  async listPersonCpd(filter, tenant) {
    return withTenant(tenant, async (tx) => {
      const rows = await tx.personCpd.findMany({
        where: filter.arId ? { arId: filter.arId } : {},
        orderBy: [{ arId: "asc" }, { person: "asc" }],
      });
      return rows.map(
        (r): CpdRegisterRow => ({
          id: r.id,
          arId: r.arId,
          person: r.person,
          cpdHours: r.cpdHours,
          required: r.required,
          strikes: r.strikes,
          certExpiry: r.certExpiry.toISOString(),
        }),
      );
    });
  },
};

/** The production CPD dependency bundle. */
export const cpdPrismaDeps: CpdDeps = {
  store: cpdPrismaStore,
  training: prismaTrainingStore,
  register: prismaStore,
  audit: prismaAudit,
};
