import { describe, it, expect, afterAll } from "vitest";
import { prisma, withTenant } from "../db";
import { prismaStore } from "../tools/prisma-adapters";
import { signOffPrismaStore } from "./prisma-adapter";
import type { Tenant } from "../tools/types";

// Integration proof that SIGN-OFF MATERIALISATION has the right semantics
// against a real database. This exists because a bug shipped here that every
// unit test missed: the in-memory store cannot model insert-vs-update, so a
// materialiser that always called create() looked correct — while in reality it
// duplicated person_cpd rows and crashed appointed_rep on its unique FRN
// (an SMF could not suspend or terminate an AR at all).
//
//   RUN_DB_TESTS=true npm test
//
// Prereq: `npm run db:setup` against a disposable database.
const RUN = process.env.RUN_DB_TESTS === "true";

const SMF: Tenant = { role: "SMF", arId: "" };
const OPERATOR: Tenant = { role: "COMPLIANCE", arId: "" };

// A person name unique to this run, so repeated runs never collide.
const TEST_PERSON = `ZZ Materialise Test ${Date.now()}`;

/** Create a PENDING draft the way the tool layer does, then sign it off. */
async function draftAndSignOff(
  register: string,
  arId: string,
  data: Record<string, unknown>,
): Promise<string> {
  const draft = await prismaStore.createPendingDraft(
    { register, arId, payload: {}, summary: `materialisation test · ${register}`, createdBy: "TEST" },
    OPERATOR,
  );
  const { registerId } = await signOffPrismaStore.signOff(
    { id: draft.id, register, data, decidedBy: "SMF:test", notes: "materialisation test" },
    SMF,
  );
  return registerId;
}

describe.runIf(RUN)("sign-off materialisation semantics (real Postgres)", () => {
  afterAll(async () => {
    // Leave the seeded roster as we found it; drop only our own rows.
    await withTenant(OPERATOR, async (tx) => {
      await tx.personCpd.deleteMany({ where: { person: TEST_PERSON } });
      await tx.appointedRep.updateMany({ where: { arId: "ar_drakestar" }, data: { status: "ACTIVE" } });
    });
    await prisma.$disconnect();
  });

  it("person_cpd: a second sign-off REPLACES the person's row, never duplicates it", async () => {
    const base = {
      arId: "ar_six",
      person: TEST_PERSON,
      required: 35,
      certExpiry: new Date("2026-12-31T00:00:00.000Z"),
    };

    const firstId = await draftAndSignOff("person_cpd", "ar_six", {
      ...base,
      cpdHours: 8,
      strikes: 0,
    });
    const secondId = await draftAndSignOff("person_cpd", "ar_six", {
      ...base,
      cpdHours: 21,
      strikes: 1,
    });

    // Same row updated in place — this is the assertion the old code failed.
    expect(secondId).toBe(firstId);

    const rows = await withTenant(OPERATOR, (tx) =>
      tx.personCpd.findMany({ where: { person: TEST_PERSON } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].cpdHours).toBe(21);
    expect(rows[0].strikes).toBe(1);
  });

  it("appointed_rep: sign-off updates the firm in place instead of violating the unique FRN", async () => {
    const before = await withTenant(OPERATOR, (tx) =>
      tx.appointedRep.findFirst({ where: { arId: "ar_drakestar" } }),
    );
    expect(before).not.toBeNull();

    // The old materialiser threw "Unique constraint failed" here, making AR
    // suspension and termination impossible.
    const registerId = await draftAndSignOff("appointed_rep", "ar_drakestar", {
      arId: "ar_drakestar",
      frn: before!.frn,
      legalName: before!.legalName,
      status: "SUSPENDED",
      onboardedAt: before!.onboardedAt,
      riskBand: before!.riskBand,
    });
    expect(registerId).toBe(before!.id);

    const rows = await withTenant(OPERATOR, (tx) =>
      tx.appointedRep.findMany({ where: { arId: "ar_drakestar" } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("SUSPENDED");
    expect(rows[0].frn).toBe(before!.frn); // FRN preserved, not duplicated
  });

  it("risk_score: every sign-off APPENDS, because assessment history is the record", async () => {
    const countFor = () =>
      withTenant(OPERATOR, (tx) => tx.riskScore.count({ where: { arId: "ar_codrington" } }));
    const before = await countFor();

    const a = await draftAndSignOff("risk_score", "ar_codrington", {
      arId: "ar_codrington",
      factors: [1, 1, 1, 1, 1],
      total: 5,
      band: "GREEN",
      cadence: "Bi-annual monitoring",
      computedAt: new Date(),
    });
    const b = await draftAndSignOff("risk_score", "ar_codrington", {
      arId: "ar_codrington",
      factors: [3, 3, 3, 3, 3],
      total: 15,
      band: "RED",
      cadence: "Quarterly + ad-hoc monitoring",
      computedAt: new Date(),
    });

    expect(a).not.toBe(b); // distinct rows, not an overwrite
    expect(await countFor()).toBe(before + 2);
  });

  it("the sign-off item records the FINAL row it produced", async () => {
    const registerId = await draftAndSignOff("person_cpd", "ar_six", {
      arId: "ar_six",
      person: TEST_PERSON,
      cpdHours: 30,
      required: 35,
      strikes: 0,
      certExpiry: new Date("2026-12-31T00:00:00.000Z"),
    });

    const item = await withTenant(OPERATOR, (tx) =>
      tx.signOffItem.findFirst({
        where: { registerId },
        orderBy: { decidedAt: "desc" },
      }),
    );
    expect(item?.status).toBe("SIGNED_OFF");
    expect(item?.decidedBy).toBe("SMF:test");
    expect(item?.registerId).toBe(registerId);
  });
});
