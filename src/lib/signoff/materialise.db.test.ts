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
    // Leave the seeded data as we found it; drop only our own rows. Every
    // fixture is prefixed "ZZ" or timestamped, so this cannot touch real rows.
    await withTenant(OPERATOR, async (tx) => {
      await tx.personCpd.deleteMany({ where: { person: TEST_PERSON } });
      await tx.cf30Return.deleteMany({ where: { quarter: { startsWith: "ZZ-" } } });
      await tx.dataBreach.deleteMany({ where: { ref: { startsWith: "ZZ-BR-" } } });
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

  it("cf30_return: one return per quarter — re-signing the same quarter replaces it", async () => {
    const quarter = `ZZ-${Date.now()}`; // unique per run
    const base = {
      arId: "ar_six",
      quarter,
      dueDate: new Date("2026-04-16T00:00:00.000Z"),
    };

    const firstId = await draftAndSignOff("cf30_return", "ar_six", { ...base, exceptions: 0 });
    const secondId = await draftAndSignOff("cf30_return", "ar_six", { ...base, exceptions: 3 });

    expect(secondId).toBe(firstId);
    const rows = await withTenant(OPERATOR, (tx) => tx.cf30Return.findMany({ where: { quarter } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].exceptions).toBe(3);

    // A DIFFERENT quarter is a different return, so it must not overwrite.
    const otherId = await draftAndSignOff("cf30_return", "ar_six", {
      ...base,
      quarter: `${quarter}-b`,
      exceptions: 1,
    });
    expect(otherId).not.toBe(firstId);
  });

  it("data_breach: status transitions land on the same breach, keyed by ref", async () => {
    const ref = `ZZ-BR-${Date.now()}`;
    const base = {
      arId: "ar_six",
      ref,
      detectedAt: new Date("2026-07-01T09:00:00.000Z"),
      art33Clock: new Date("2026-07-04T09:00:00.000Z"),
      severity: "HIGH" as const,
    };

    const firstId = await draftAndSignOff("data_breach", "ar_six", { ...base, status: "PENDING" });
    // Reporting it to the ICO is a transition on the SAME breach — a second row
    // would mean one incident appearing twice in the register.
    const secondId = await draftAndSignOff("data_breach", "ar_six", { ...base, status: "REPORTED" });

    expect(secondId).toBe(firstId);
    const rows = await withTenant(OPERATOR, (tx) => tx.dataBreach.findMany({ where: { ref } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("REPORTED");
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
