// Seeds the fixed AR roster (Invariant 7 / CLAUDE.md rule 7): SIX Financial
// Information UK, Drake Star UK, Codrington Associates. No other ARs.
//
// Runs as ccs_app under FORCE RLS, so all writes happen inside a single
// transaction with app.role = COMPLIANCE (network draft authority) so the
// tenant WITH CHECK passes for every firm.
//
// FRNs below are PLACEHOLDERS pending confirmation from Razlin — replace with
// the real AR FRNs before any real data. Dates are illustrative; CF30 due
// dates are computed by the deterministic engine in Phase 6, not hardcoded.
import { PrismaClient } from "@prisma/client";
import { buildCf30Return } from "../src/lib/models/cf30";
import { PRINCIPAL } from "../src/lib/principal";

const prisma = new PrismaClient();

const ARS = [
  { arId: "ar_six", frn: "900001", legalName: "SIX Financial Information UK Ltd", riskBand: "GREEN" as const },
  { arId: "ar_drakestar", frn: "900002", legalName: "Drake Star UK LLP", riskBand: "AMBER" as const },
  { arId: "ar_codrington", frn: "900003", legalName: "Codrington Associates Ltd", riskBand: "GREEN" as const },
];

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.role', 'COMPLIANCE', true)`;
    await tx.$executeRaw`SELECT set_config('app.ar_id', '', true)`;

    for (const ar of ARS) {
      await tx.appointedRep.upsert({
        where: { frn: ar.frn },
        update: {},
        create: {
          id: ar.arId,
          arId: ar.arId,
          frn: ar.frn,
          legalName: ar.legalName,
          status: "ACTIVE",
          onboardedAt: new Date("2025-01-15T09:00:00Z"),
          riskBand: ar.riskBand,
        },
      });

      // Derived by the engine, NOT hand-typed (Invariant 7). This used to
      // hardcode 2026-04-14 while the engine computes 2026-04-16 for Q1 2026 —
      // a live agent run halted to OPERATOR REVIEW over the contradiction
      // rather than drafting a chase against a due date it could not trust.
      await tx.cf30Return.create({
        data: buildCf30Return({ arId: ar.arId, referenceDate: "2026-03-31", exceptions: 0 }).data,
      });

      await tx.riskScore.create({
        data: {
          arId: ar.arId,
          // Canonical shape: scores 1-3 in RISK_FACTORS order
          // [conduct, aml, complaints, cpd, promotions]. Stored as an array to
          // match the risk_score register schema (a keyed object fails it).
          factors: ar.riskBand === "AMBER" ? [2, 2, 2, 2, 1] : [1, 2, 1, 1, 1],
          total: ar.riskBand === "AMBER" ? 9 : 6,
          band: ar.riskBand,
          cadence: ar.riskBand === "AMBER" ? "quarterly" : "bi-annual",
          computedAt: new Date("2026-04-10T06:02:00Z"),
        },
      });

      await tx.personCpd.create({
        data: {
          arId: ar.arId,
          person: "Approved Person",
          cpdHours: 18,
          required: PRINCIPAL.cpd.requiredHours,
          strikes: 0,
          certExpiry: new Date("2026-12-31T00:00:00Z"),
        },
      });

      // Training-completion evidence feeding person_cpd (m1 + m2 = 8 credited h).
      await tx.trainingCompletion.createMany({
        data: [
          { arId: ar.arId, person: "Approved Person", moduleId: "m1", moduleTitle: "Regulatory Framework", quarter: "Q1", score: 6, outOf: 6, pct: 100, passed: true, completedAt: new Date("2026-02-10T10:00:00Z") },
          { arId: ar.arId, person: "Approved Person", moduleId: "m2", moduleTitle: "SM&CR and Fitness & Propriety", quarter: "Q1", score: 4, outOf: 5, pct: 80, passed: true, completedAt: new Date("2026-02-12T10:00:00Z") },
        ],
      });

      // A stored training certificate (WORM manifest — bytes live in the blob store).
      await tx.trainingCertificate.create({
        data: {
          arId: ar.arId,
          person: "Approved Person",
          moduleId: "m1",
          certificateId: `CERT-${ar.arId}-m1`,
          name: "m1-certificate.pdf",
          sha256: `seedcert${ar.arId}`.padEnd(64, "0"),
          size: 2048,
          blobUrl: `mem://ccs-docs/seed-${ar.arId}-m1`,
        },
      });
    }

    // A financial promotion for Codrington (matches the AR-portal reference).
    await tx.financialPromotion.create({
      data: {
        arId: "ar_codrington",
        ref: "FP-0234",
        type: "TEASER",
        title: "European MedTech — Q3 sector teaser",
        audience: "Professional",
        cobs: [
          { label: "Fair, clear and not misleading (COBS 4.2)", checked: true },
          { label: "Risk warnings prominent and balanced", checked: true },
          { label: "Past performance caveats included where relevant", checked: false },
          { label: "Target audience and distribution channel identified", checked: false },
        ],
        status: "PENDING",
        submittedBy: "codrington.compliance@example.com",
      },
    });

    // Append-only registers: a seed audit + agent-run row.
    await tx.auditEvent.create({
      data: { actor: "system", action: "SEED", entity: "appointed_rep", entityId: "ar_six" },
    });
    await tx.agentRun.create({
      data: {
        agentId: "agent-quarterly-cycle",
        version: "v3",
        promptHash: "seed",
        inputHash: "seed",
        tokens: 0,
        output: { note: "seed placeholder run log" },
      },
    });
  });

  console.log("Seed complete: 3 ARs + registers.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
