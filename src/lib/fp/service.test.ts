import { describe, it, expect } from "vitest";
import {
  submitPromotion,
  decidePromotion,
  FpError,
  type FpDeps,
  type FpRecord,
  type FpStore,
  type CobsItem,
} from "./service";
import { createInMemoryBlobStore, sha256 } from "./storage";
import { auditTrailToCsv } from "./audit-csv";
import type { Tenant } from "../tools/types";

const enc = new TextEncoder();
const COBS: CobsItem[] = [
  { label: "Fair, clear and not misleading (COBS 4.2)", checked: true },
  { label: "Risk warnings prominent and balanced", checked: true },
];

// In-memory FpStore + audit collector so the service runs with no DB.
function makeDeps() {
  const audited: { actor: string; action: string; entityId?: string }[] = [];
  const promotions = new Map<string, FpRecord>();
  const docs: { promotionId: string; sha256: string }[] = [];
  let seq = 0;

  const store: FpStore = {
    async createPromotion(input) {
      seq += 1;
      const rec: FpRecord = {
        id: `fp${seq}`,
        arId: input.arId,
        ref: `FP-${String(1000 + seq).padStart(4, "0")}`,
        type: input.type,
        title: input.title,
        audience: input.audience,
        cobs: input.cobs,
        status: "PENDING",
        submittedBy: input.submittedBy,
        reviewedBy: null,
        reviewerNotes: null,
      };
      promotions.set(rec.id, rec);
      return rec;
    },
    async addDocuments(promotionId, _arId, ds) {
      for (const d of ds) docs.push({ promotionId, sha256: d.sha256 });
    },
    async getPromotion(id) {
      return promotions.get(id) ?? null;
    },
    async setDecision(id, decision) {
      const rec = promotions.get(id)!;
      const next = { ...rec, status: decision.status, reviewedBy: decision.reviewedBy, reviewerNotes: decision.reviewerNotes };
      promotions.set(id, next);
      return next;
    },
  };

  const deps: FpDeps = {
    store,
    audit: {
      append: async (e) => {
        audited.push({ actor: e.actor, action: e.action, entityId: e.entityId });
        return { id: `a${audited.length}` };
      },
    },
    blob: createInMemoryBlobStore(),
  };
  return { deps, audited, promotions, docs };
}

const AR_SIX: Tenant = { role: "AR", arId: "ar_six" };
const SMF: Tenant = { role: "SMF", arId: "" };
const COMPLIANCE: Tenant = { role: "COMPLIANCE", arId: "" };

describe("sha256", () => {
  it("matches known vectors and is deterministic", () => {
    expect(sha256(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256(enc.encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256(enc.encode("abc"))).toBe(sha256(enc.encode("abc")));
  });
});

describe("submitPromotion", () => {
  it("creates a PENDING promotion with a hashed manifest and audits SUBMITTED + DOCS ATTACHED", async () => {
    const { deps, audited, docs } = makeDeps();
    const { promotion, documents } = await submitPromotion(deps, AR_SIX, {
      arId: "ar_six",
      type: "TEASER",
      title: "European MedTech — Q3 sector teaser",
      audience: "Professional",
      cobs: COBS,
      submittedBy: "u-ar",
      files: [
        { name: "teaser.pdf", bytes: enc.encode("teaser bytes") },
        { name: "annex.pdf", bytes: enc.encode("annex bytes") },
      ],
    });

    expect(promotion.status).toBe("PENDING");
    expect(promotion.ref).toMatch(/^FP-\d{4}$/);
    expect(documents).toHaveLength(2);
    expect(documents[0].sha256).toBe(sha256(enc.encode("teaser bytes")));
    expect(documents[0].blobUrl).toContain(documents[0].sha256);
    expect(docs).toHaveLength(2);
    expect(audited.map((a) => a.action)).toEqual(["SUBMITTED", "DOCS ATTACHED"]);
  });

  it("audits only SUBMITTED when there are no files", async () => {
    const { deps, audited } = makeDeps();
    await submitPromotion(deps, AR_SIX, {
      arId: "ar_six",
      type: "RESEARCH",
      title: "no docs",
      audience: "Professional",
      cobs: COBS,
      submittedBy: "u-ar",
      files: [],
    });
    expect(audited.map((a) => a.action)).toEqual(["SUBMITTED"]);
  });

  it("rejects an empty COBS checklist (400)", async () => {
    const { deps } = makeDeps();
    await expect(
      submitPromotion(deps, AR_SIX, {
        arId: "ar_six",
        type: "TEASER",
        title: "x",
        audience: "Professional",
        cobs: [],
        submittedBy: "u-ar",
        files: [],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("forbids an AR submitting for another firm (403)", async () => {
    const { deps } = makeDeps();
    await expect(
      submitPromotion(deps, AR_SIX, {
        arId: "ar_drakestar",
        type: "TEASER",
        title: "x",
        audience: "Professional",
        cobs: COBS,
        submittedBy: "u-ar",
        files: [],
      }),
    ).rejects.toBeInstanceOf(FpError);
  });
});

describe("decidePromotion — SMF is the sole sign-off", () => {
  async function seed(deps: FpDeps) {
    const { promotion } = await submitPromotion(deps, AR_SIX, {
      arId: "ar_six",
      type: "TEASER",
      title: "seed",
      audience: "Professional",
      cobs: COBS,
      submittedBy: "u-ar",
      files: [],
    });
    return promotion.id;
  }

  it("ADOPT by an SMF sets ADOPTED and audits ADOPTED", async () => {
    const { deps, audited } = makeDeps();
    const id = await seed(deps);
    const out = await decidePromotion(deps, SMF, { id, decision: "ADOPT", actor: "u-smf" });
    expect(out.status).toBe("ADOPTED");
    expect(out.reviewedBy).toBe("u-smf");
    expect(audited.some((a) => a.action === "ADOPTED" && a.entityId === id)).toBe(true);
  });

  it("REJECT requires reviewer notes (400), then sets REJECTED with notes", async () => {
    const { deps } = makeDeps();
    const id = await seed(deps);
    await expect(
      decidePromotion(deps, SMF, { id, decision: "REJECT", actor: "u-smf" }),
    ).rejects.toMatchObject({ status: 400 });

    const out = await decidePromotion(deps, SMF, {
      id,
      decision: "REJECT",
      actor: "u-smf",
      notes: "Risk warning not prominent — revise and resubmit.",
    });
    expect(out.status).toBe("REJECTED");
    expect(out.reviewerNotes).toMatch(/revise/);
  });

  it("forbids AR and COMPLIANCE from deciding (403)", async () => {
    const { deps } = makeDeps();
    const id = await seed(deps);
    await expect(decidePromotion(deps, AR_SIX, { id, decision: "ADOPT", actor: "u-ar" })).rejects.toMatchObject({ status: 403 });
    await expect(decidePromotion(deps, COMPLIANCE, { id, decision: "ADOPT", actor: "u-comp" })).rejects.toMatchObject({ status: 403 });
  });

  it("404s an unknown promotion and 409s a re-decision", async () => {
    const { deps } = makeDeps();
    const id = await seed(deps);
    await expect(decidePromotion(deps, SMF, { id: "nope", decision: "ADOPT", actor: "u-smf" })).rejects.toMatchObject({ status: 404 });
    await decidePromotion(deps, SMF, { id, decision: "ADOPT", actor: "u-smf" });
    await expect(decidePromotion(deps, SMF, { id, decision: "REJECT", actor: "u-smf", notes: "late" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("auditTrailToCsv", () => {
  it("emits a header + one row each, quoting commas and quotes", () => {
    const csv = auditTrailToCsv([
      { ts: "2026-04-14T09:00:00.000Z", actor: "u-ar", action: "SUBMITTED", entity: "financial_promotion", entityId: "fp1" },
      { ts: new Date("2026-04-15T10:30:00.000Z"), actor: "u-smf", action: "ADOPTED", entity: "financial_promotion", entityId: "fp1" },
      { ts: "2026-04-16T11:00:00.000Z", actor: "u-smf", action: 'REJECTED, "final"', entity: "financial_promotion", entityId: null },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("timestamp,actor,action,entity,entity_id");
    expect(lines[1]).toBe("2026-04-14T09:00:00.000Z,u-ar,SUBMITTED,financial_promotion,fp1");
    expect(lines[2]).toContain("u-smf,ADOPTED,financial_promotion,fp1");
    // Embedded comma + quotes are escaped per RFC 4180.
    expect(lines[3]).toContain('"REJECTED, ""final"""');
  });
});
