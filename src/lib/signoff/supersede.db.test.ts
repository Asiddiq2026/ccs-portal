import { describe, it, expect, afterAll } from "vitest";
import { prisma, withTenant } from "../db";
import { prismaStore } from "../tools/prisma-adapters";
import type { Tenant } from "../tools/types";

// Integration proof that queue SUPERSEDING has the right semantics against a
// real database. When a newer draft proposes an update to the SAME register
// row as an older PENDING draft, the older one must flip to SUPERSEDED so the
// SMF only ever decides the latest evidence once — previously two identical
// CPD drafts both sat in the queue and both cost a decision (and both hit the
// audit log). Event streams, different identities and cross-firm drafts must
// NOT supersede.
//
//   RUN_DB_TESTS=true npm test
//
// Prereq: `npm run db:setup` against a disposable database.
const RUN = process.env.RUN_DB_TESTS === "true";

const OPERATOR: Tenant = { role: "COMPLIANCE", arId: "" };

// Unique per run so repeated runs never collide.
const STAMP = Date.now();
const PERSON_A = `ZZ Supersede A ${STAMP}`;
const PERSON_B = `ZZ Supersede B ${STAMP}`;

async function draft(
  register: string,
  arId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const { id } = await prismaStore.createPendingDraft(
    { register, arId, payload, summary: `supersede test · ${register}`, createdBy: "TEST" },
    OPERATOR,
  );
  return id;
}

async function statusOf(id: string): Promise<string | null> {
  const row = await withTenant(OPERATOR, (tx) => tx.signOffItem.findUnique({ where: { id } }));
  return row?.status ?? null;
}

describe.runIf(RUN)("queue superseding semantics (real Postgres)", () => {
  afterAll(async () => {
    await withTenant(OPERATOR, async (tx) => {
      await tx.signOffItem.deleteMany({
        where: { summary: { startsWith: "supersede test ·" }, createdBy: "TEST" },
      });
    });
    await prisma.$disconnect();
  });

  it("a newer person_cpd draft supersedes the older one for the same person", async () => {
    const older = await draft("person_cpd", "ar_six", {
      arId: "ar_six",
      person: PERSON_A,
      cpdHours: 8,
      required: 35,
      strikes: 0,
      certExpiry: "2026-12-31",
    });
    expect(await statusOf(older)).toBe("PENDING");

    const newer = await draft("person_cpd", "ar_six", {
      arId: "ar_six",
      person: PERSON_A,
      cpdHours: 21,
      required: 35,
      strikes: 1,
      certExpiry: "2026-12-31",
    });

    // The older draft is retired; only the newer one remains for the SMF.
    expect(await statusOf(older)).toBe("SUPERSEDED");
    expect(await statusOf(newer)).toBe("PENDING");

    // The supersession is auditable — an event names the replacing draft.
    const audit = await withTenant(OPERATOR, (tx) =>
      tx.auditEvent.findFirst({
        where: { entity: "sign_off_item", entityId: older, action: { startsWith: "DRAFT SUPERSEDED" } },
      }),
    );
    expect(audit).not.toBeNull();
    expect(audit!.action).toContain(newer);
  });

  it("a draft for a DIFFERENT person leaves the first untouched", async () => {
    const forA = await draft("person_cpd", "ar_six", {
      arId: "ar_six",
      person: `${PERSON_B}-A`,
      cpdHours: 5,
      required: 35,
      strikes: 0,
      certExpiry: "2026-12-31",
    });
    await draft("person_cpd", "ar_six", {
      arId: "ar_six",
      person: `${PERSON_B}-B`,
      cpdHours: 5,
      required: 35,
      strikes: 0,
      certExpiry: "2026-12-31",
    });
    // Different identity → both stand.
    expect(await statusOf(forA)).toBe("PENDING");
  });

  it("risk_score is an event stream — a second draft NEVER supersedes the first", async () => {
    const first = await draft("risk_score", "ar_codrington", {
      arId: "ar_codrington",
      factors: [1, 1, 1, 1, 1],
      total: 5,
      band: "GREEN",
      cadence: "Bi-annual monitoring",
      computedAt: new Date().toISOString(),
    });
    await draft("risk_score", "ar_codrington", {
      arId: "ar_codrington",
      factors: [3, 3, 3, 3, 3],
      total: 15,
      band: "RED",
      cadence: "Quarterly + ad-hoc monitoring",
      computedAt: new Date().toISOString(),
    });
    // Both assessments remain — history is the record.
    expect(await statusOf(first)).toBe("PENDING");
  });

  it("only PENDING drafts are superseded — a decided draft is never disturbed", async () => {
    // Simulate a draft already decided (e.g. signed off moments earlier).
    const decided = await draft("person_cpd", "ar_six", {
      arId: "ar_six",
      person: `${PERSON_A}-decided`,
      cpdHours: 8,
      required: 35,
      strikes: 0,
      certExpiry: "2026-12-31",
    });
    await withTenant(OPERATOR, (tx) =>
      tx.signOffItem.update({ where: { id: decided }, data: { status: "SIGNED_OFF" } }),
    );

    await draft("person_cpd", "ar_six", {
      arId: "ar_six",
      person: `${PERSON_A}-decided`,
      cpdHours: 21,
      required: 35,
      strikes: 1,
      certExpiry: "2026-12-31",
    });

    // The status guard means the already-decided draft keeps its terminal state.
    expect(await statusOf(decided)).toBe("SIGNED_OFF");
  });
});
