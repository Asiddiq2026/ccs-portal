// Prisma-backed CertificateStore. Manifest + audit are written in one withTenant
// transaction (createMany, no RETURNING — audit_event's SELECT policy is
// operator-only). training_certificate is append-only (RLS revokes UPDATE/
// DELETE), so this adapter only creates and reads.
import { randomUUID } from "node:crypto";
import { withTenant } from "../db";
import { appendAuditTx } from "../audit/append";
import type { CertificateStore } from "./certificate";

export const prismaCertificateStore: CertificateStore = {
  async record({ manifest, audit }, tenant) {
    return withTenant(tenant, async (tx) => {
      const id = `cert_${randomUUID()}`;
      await tx.trainingCertificate.createMany({
        data: [
          {
            id,
            arId: manifest.arId,
            person: manifest.person,
            moduleId: manifest.moduleId,
            certificateId: manifest.certificateId,
            name: manifest.name,
            sha256: manifest.sha256,
            size: manifest.size,
            blobUrl: manifest.blobUrl,
          },
        ],
      });
      // Chained writer — keeps certificate events inside the audit chain.
      await appendAuditTx(tx, {
        id: `evt_${randomUUID()}`,
        actor: audit.actor,
        action: audit.action,
        entity: audit.entity,
        entityId: audit.entityId,
      });
      return { id };
    });
  },

  async listForEvidence(filter, tenant) {
    return withTenant(tenant, async (tx) => {
      const rows = await tx.trainingCertificate.findMany({
        where: { arId: filter.arId, ...(filter.person ? { person: filter.person } : {}) },
        select: { name: true, sha256: true, blobUrl: true, size: true },
      });
      return rows;
    });
  },
};
