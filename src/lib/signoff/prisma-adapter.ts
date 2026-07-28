// Production wiring for the sign-off decision path. The FINAL register write and
// the item status flip happen in ONE withTenant() transaction, so RLS binds the
// caller and the two never diverge: if the guarded flip finds the item is no
// longer PENDING, the throw rolls back the FINAL row too (Invariants 1 & 3).
// Only this adapter imports Prisma; the service stays DB-free.
import { withTenant } from "../db";
import { prismaAudit } from "../tools/prisma-adapters";
import { SignOffError, type SignOffDeps, type SignOffStore } from "./service";
import { identityWhere, isMaterialisable } from "./register-schemas";

// Materialisable register -> Prisma delegate. financial_promotion is absent by
// design (it has its own decision channel); an attempt is refused upstream.
const DELEGATE: Record<string, string> = {
  cf30_return: "cf30Return",
  risk_score: "riskScore",
  person_cpd: "personCpd",
  data_breach: "dataBreach",
  appointed_rep: "appointedRep",
};

export const signOffPrismaStore: SignOffStore = {
  async get(id, tenant) {
    return withTenant(tenant, async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = await (tx as any).signOffItem.findUnique({ where: { id } });
      if (!item) return null;
      return {
        id: item.id as string,
        arId: item.arId as string,
        register: item.register as string,
        payload: (item.payload ?? {}) as Record<string, unknown>,
        summary: item.summary as string,
        status: item.status as "PENDING" | "SIGNED_OFF" | "RETURNED",
      };
    });
  },

  async signOff({ id, register, data, decidedBy, notes }, tenant) {
    const delegate = DELEGATE[register];
    if (!delegate) throw new SignOffError(422, `register ${register} is not materialisable`);
    return withTenant(tenant, async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyTx = tx as any;

      // Write the FINAL register row first; the guarded flip below rolls this
      // back if the item was decided by someone else in the meantime.
      //
      // Identity decides INSERT vs UPDATE. For a current-position register
      // (person_cpd, appointed_rep, cf30_return, data_breach) signing off
      // REPLACES the entity's row: blindly inserting would duplicate the person
      // or firm, and on appointed_rep would violate the unique FRN outright. For
      // an event stream (risk_score) every sign-off appends. See REGISTER_IDENTITY.
      const where = isMaterialisable(register) ? identityWhere(register, data) : null;
      let row: { id: string };
      if (where) {
        const existing = await anyTx[delegate].findFirst({ where, select: { id: true } });
        row = existing
          ? await anyTx[delegate].update({ where: { id: existing.id }, data })
          : await anyTx[delegate].create({ data });
      } else {
        row = await anyTx[delegate].create({ data });
      }
      const upd = await anyTx.signOffItem.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "SIGNED_OFF",
          decidedBy,
          decidedAt: new Date(),
          registerId: row.id,
          notes: notes ?? null,
        },
      });
      if (upd.count === 0) throw new SignOffError(409, "draft is no longer PENDING");
      return { registerId: row.id as string };
    });
  },

  async return({ id, decidedBy, notes }, tenant) {
    return withTenant(tenant, async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upd = await (tx as any).signOffItem.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "RETURNED", decidedBy, decidedAt: new Date(), notes },
      });
      if (upd.count === 0) throw new SignOffError(409, "draft is no longer PENDING");
    });
  },

  async approveArtifact({ id, decidedBy, notes }, tenant) {
    return withTenant(tenant, async (tx) => {
      // No register write — a pack is not a regulated fact. Flip to SIGNED_OFF
      // only, guarded on it still being PENDING. registerId stays null.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upd = await (tx as any).signOffItem.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "SIGNED_OFF", decidedBy, decidedAt: new Date(), notes: notes ?? null },
      });
      if (upd.count === 0) throw new SignOffError(409, "draft is no longer PENDING");
    });
  },
};

/** The production dependency bundle for the sign-off route. */
export const signOffPrismaDeps: SignOffDeps = {
  store: signOffPrismaStore,
  audit: prismaAudit,
};
